import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { evaluateReleaseGate } from '../pools/release-gate';
import { NotificationsService } from './notifications.service';

/**
 * Libera sozinho os bolões condicionais cujo prêmio atingiu o gatilho (sem esperar alguém tentar reservar)
 * e avisa quem pediu "avise-me". Também envia por e-mail os avisos pendentes.
 */
@Injectable()
export class PoolReleaseWatcher {
  private readonly logger = new Logger(PoolReleaseWatcher.name);
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly notifications: NotificationsService) {}

  @Cron('*/5 * * * *')
  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      await this.releaseReachedPools();
      await this.notifyAlreadyReleased();
      await this.notifications.dispatchPending();
    } catch (error) {
      this.logger.error(`Rotina de liberação/avisos falhou: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }

  /** Bolões liberados por outro caminho (ex.: na primeira reserva) que ainda têm interessados sem aviso. */
  async notifyAlreadyReleased(): Promise<number> {
    const waiting = await this.prisma.bolaoInteresse.findMany({ where: { notificadoEm: null, bolao: { liberadoEm: { not: null } } }, select: { bolaoId: true }, distinct: ['bolaoId'], take: 50 });
    let total = 0;
    for (const item of waiting) total += await this.notifications.notifyPoolReleased(item.bolaoId);
    return total;
  }

  async releaseReachedPools(): Promise<number> {
    const candidates = await this.prisma.bolao.findMany({
      where: { premioMinimoLiberacao: { not: null }, liberadoEm: null, status: 'aberto' },
      select: { id: true, premioMinimoLiberacao: true, liberadoEm: true, concurso: { select: { valorEstimadoPremio: true } } },
    });
    let released = 0;
    for (const pool of candidates) {
      const gate = evaluateReleaseGate({ premioMinimoLiberacao: pool.premioMinimoLiberacao, liberadoEm: pool.liberadoEm, premioAtual: pool.concurso?.valorEstimadoPremio });
      if (!gate.liberado) continue;
      const result = await this.prisma.$transaction(async (tx) => {
        const updated = await tx.bolao.updateMany({ where: { id: pool.id, liberadoEm: null }, data: { liberadoEm: new Date() } });
        if (updated.count === 1) await this.audit.record(tx, { entidade: 'bolao', entidadeId: pool.id, evento: 'bolao.liberado_automaticamente', payloadDepois: { premioAtual: Number(pool.concurso?.valorEstimadoPremio ?? 0), gatilho: Number(pool.premioMinimoLiberacao) } as unknown as Prisma.InputJsonValue });
        return updated.count;
      });
      if (result === 1) { released += 1; await this.notifications.notifyPoolReleased(pool.id); }
    }
    if (released > 0) this.logger.log(`${released} bolão(ões) condicional(is) liberado(s) automaticamente.`);
    return released;
  }
}
