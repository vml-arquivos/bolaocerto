import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { AlertService } from '../common/alert.service';
import { PrismaService } from '../common/prisma.service';

const STALE_SYNC_MINUTES = 90;

/**
 * Vigia o que nunca pode ser esquecido: apostas PAGAS que ainda não foram registradas na CAIXA com o sorteio chegando,
 * apurações atrasadas e sincronização parada. Alimenta o painel de saúde e dispara alertas (com freio).
 */
@Injectable()
export class OpsWatchService {
  private readonly logger = new Logger(OpsWatchService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly alerts: AlertService, private readonly config: ConfigService) {}

  /** Bolões com cotas pagas, ainda sem registro na CAIXA, cujo prazo termina nas próximas `hours` horas (ou já passou). */
  async unregisteredPools(hours = 4) {
    const limit = new Date(Date.now() + hours * 3_600_000);
    const pools = await this.prisma.bolao.findMany({
      where: { status: { in: ['aberto', 'fechado'] }, cotas: { some: { status: 'paga' } }, concurso: { cutoffAt: { lte: limit }, dataSorteio: { gte: new Date(Date.now() - 3_600_000) } } },
      select: { id: true, grupo: { select: { nome: true } }, concurso: { select: { modalidade: true, numeroConcurso: true, cutoffAt: true, dataSorteio: true } }, cotas: { where: { status: 'paga' }, select: { quantidade: true } } },
      orderBy: { concurso: { cutoffAt: 'asc' } },
      take: 50,
    });
    return pools.map((pool) => ({ bolaoId: pool.id, grupo: pool.grupo?.nome ?? null, modalidade: pool.concurso.modalidade, concurso: pool.concurso.numeroConcurso, cutoffAt: pool.concurso.cutoffAt, sorteio: pool.concurso.dataSorteio, cotasPagas: pool.cotas.reduce((sum, share) => sum + share.quantidade, 0), atrasado: pool.concurso.cutoffAt.getTime() < Date.now() }));
  }

  /** Bolões registrados cujo sorteio já passou há mais de 12 h e continuam sem apuração. */
  async overdueSettlements() {
    const pools = await this.prisma.bolao.findMany({
      where: { status: 'registrado', concurso: { dataSorteio: { lt: new Date(Date.now() - 12 * 3_600_000) } } },
      select: { id: true, concurso: { select: { modalidade: true, numeroConcurso: true, dataSorteio: true } } },
      take: 50,
    });
    return pools.map((pool) => ({ bolaoId: pool.id, modalidade: pool.concurso.modalidade, concurso: pool.concurso.numeroConcurso, sorteio: pool.concurso.dataSorteio }));
  }

  async syncStatus() {
    const latest = await this.prisma.concurso.findFirst({ orderBy: { sincronizadoEm: 'desc' }, select: { sincronizadoEm: true } });
    const last = latest?.sincronizadoEm ?? null;
    const ageMinutes = last ? Math.round((Date.now() - last.getTime()) / 60_000) : null;
    return { ultima: last, idadeMinutos: ageMinutes, ok: ageMinutes !== null && ageMinutes <= STALE_SYNC_MINUTES };
  }

  async snapshot() {
    const [unregistered, overdue, sync] = await Promise.all([this.unregisteredPools(), this.overdueSettlements(), this.syncStatus()]);
    return {
      geradoEm: new Date(),
      sincronizacaoCaixa: sync,
      pagamentos: { provedor: this.config.get<string>('PAYMENT_PROVIDER') ?? null, habilitado: this.config.get<string>('PAYMENTS_ENABLED') === 'true' || this.config.get<string>('PLATFORM_PAYMENTS_ENABLED') === 'true' },
      email: { configurado: Boolean(this.config.get<string>('SMTP_HOST')?.trim()) },
      alertas: { configurado: this.alerts.isConfigured() },
      pendencias: { apostasNaoRegistradas: unregistered, apuracoesAtrasadas: overdue },
      ok: sync.ok && unregistered.length === 0 && overdue.length === 0,
    };
  }

  @Cron('*/30 * * * *')
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      for (const pool of await this.unregisteredPools(3)) {
        const when = pool.atrasado ? 'JÁ PASSOU do prazo' : `prazo em ${pool.cutoffAt.toISOString()}`;
        await this.alerts.alert(`registro:${pool.bolaoId}`, `Registre a aposta! Bolão ${pool.modalidade} #${pool.concurso} (${pool.grupo ?? 'sem grupo'}) tem ${pool.cotasPagas} cota(s) paga(s) e ainda não foi registrado na CAIXA — ${when}.`, 3 * 3_600_000);
      }
      for (const pool of await this.overdueSettlements()) {
        await this.alerts.alert(`apuracao:${pool.bolaoId}`, `Apuração atrasada: bolão ${pool.modalidade} #${pool.concurso} foi sorteado e continua sem apuração (verifique o worker e a conferência manual).`, 6 * 3_600_000);
      }
      const sync = await this.syncStatus();
      if (!sync.ok) await this.alerts.alert('sync-parada', `Sincronização com a CAIXA parada${sync.idadeMinutos !== null ? ` há ${sync.idadeMinutos} min` : ' (nunca sincronizou)'}. Confira o worker e o diagnóstico da CAIXA no painel.`, 3 * 3_600_000);
    } catch (error) {
      this.logger.error(`Vigilância operacional falhou: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
