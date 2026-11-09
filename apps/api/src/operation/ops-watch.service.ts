import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Cron } from '@nestjs/schedule';
import { AlertService } from '../common/alert.service';
import { Prisma } from '@prisma/client';
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

  /** Bolões apurados em que o Time do Coração / Mês de Sorte não pôde ser conferido sozinho: a equipe confere e repassa na mão. */
  async specialTierPending() {
    const pools = await this.prisma.bolao.findMany({
      where: { status: 'apurado', apuracao: { not: Prisma.DbNull }, concurso: { dataSorteio: { gte: new Date(Date.now() - 45 * 86_400_000) } } },
      select: { id: true, apuracao: true, concurso: { select: { modalidade: true, numeroConcurso: true, dataSorteio: true } } },
      orderBy: { concurso: { dataSorteio: 'desc' } },
      take: 200,
    });
    return pools
      .map((pool) => ({ pool, motivo: (pool.apuracao as { faixaEspecialNaoConferida?: unknown } | null)?.faixaEspecialNaoConferida }))
      .filter((entry): entry is { pool: (typeof pools)[number]; motivo: string } => typeof entry.motivo === 'string' && entry.motivo.length > 0)
      .map(({ pool, motivo }) => ({ bolaoId: pool.id, modalidade: pool.concurso.modalidade, concurso: pool.concurso.numeroConcurso, sorteio: pool.concurso.dataSorteio, motivo }));
  }

  /** Pagamentos que falharam nos últimos 3 dias e cuja cota continua reservada: a pessoa pode precisar de ajuda para pagar. */
  async failedPayments() {
    const rows = await this.prisma.pagamento.findMany({
      where: { status: 'falhou', criadoEm: { gte: new Date(Date.now() - 3 * 86_400_000) }, cota: { status: 'reservada' } },
      select: { id: true, metodo: true, valorBruto: true, criadoEm: true, cota: { select: { titularNome: true, bolao: { select: { id: true, concurso: { select: { modalidade: true, numeroConcurso: true } } } } } } },
      orderBy: { criadoEm: 'desc' },
      take: 30,
    });
    return rows.map((row) => ({ pagamentoId: row.id, metodo: row.metodo, valor: Number(row.valorBruto), em: row.criadoEm, titular: row.cota.titularNome, bolaoId: row.cota.bolao.id, modalidade: row.cota.bolao.concurso.modalidade, concurso: row.cota.bolao.concurso.numeroConcurso }));
  }

  /** Cotas premiadas cujo aviso de prêmio não saiu depois de mais de 2 horas. */
  async prizesWithoutNotice() {
    const rows = await this.prisma.cota.findMany({
      where: { status: 'premiada', premioNotificadoEm: null, bolao: { apuradoEm: { lt: new Date(Date.now() - 2 * 3_600_000) } } },
      select: { id: true, titularNome: true, valorPremio: true, bolaoId: true },
      take: 30,
    });
    return rows.map((row) => ({ cotaId: row.id, titular: row.titularNome, valorPremio: row.valorPremio === null ? null : Number(row.valorPremio), bolaoId: row.bolaoId }));
  }

  /** Cada verificação extra é independente: se uma falhar, as outras e o painel continuam funcionando. */
  private async safe<T>(run: () => Promise<T[]>): Promise<T[]> {
    try { return await run(); } catch (error) { this.logger.warn(`Verificação extra falhou: ${error instanceof Error ? error.message : String(error)}`); return []; }
  }

  async syncStatus() {
    const latest = await this.prisma.concurso.findFirst({ orderBy: { sincronizadoEm: 'desc' }, select: { sincronizadoEm: true } });
    const last = latest?.sincronizadoEm ?? null;
    const ageMinutes = last ? Math.round((Date.now() - last.getTime()) / 60_000) : null;
    return { ultima: last, idadeMinutos: ageMinutes, ok: ageMinutes !== null && ageMinutes <= STALE_SYNC_MINUTES };
  }

  async snapshot() {
    const [unregistered, overdue, sync] = await Promise.all([this.unregisteredPools(), this.overdueSettlements(), this.syncStatus()]);
    const [special, failed, unnoticed] = await Promise.all([this.safe(() => this.specialTierPending()), this.safe(() => this.failedPayments()), this.safe(() => this.prizesWithoutNotice())]);
    return {
      geradoEm: new Date(),
      sincronizacaoCaixa: sync,
      pagamentos: { provedor: this.config.get<string>('PAYMENT_PROVIDER') ?? null, habilitado: this.config.get<string>('PAYMENTS_ENABLED') === 'true' || this.config.get<string>('PLATFORM_PAYMENTS_ENABLED') === 'true' },
      email: { configurado: Boolean(this.config.get<string>('SMTP_HOST')?.trim()) },
      alertas: { configurado: this.alerts.isConfigured() },
      pendencias: { apostasNaoRegistradas: unregistered, apuracoesAtrasadas: overdue, faixasEspeciais: special, pagamentosFalhos: failed, premiosSemAviso: unnoticed },
      ok: sync.ok && unregistered.length === 0 && overdue.length === 0 && special.length === 0 && unnoticed.length === 0,
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
