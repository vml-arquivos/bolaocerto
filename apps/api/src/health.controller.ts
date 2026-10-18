import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';
import { PrismaService } from './common/prisma.service';

const STALE_SYNC_MINUTES = 90;

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  /** Liveness: o processo está de pé e conversa com o banco (usado pelo healthcheck do Docker/Coolify). */
  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', service: 'bl-api', timestamp: new Date().toISOString() };
  }

  /**
   * Readiness para monitores externos (UptimeRobot, Better Stack…): 503 se o banco cair;
   * "degraded" (ainda 200) se a sincronização com a CAIXA estiver parada.
   */
  @Get('health/ready')
  async ready() {
    try { await this.prisma.$queryRaw`SELECT 1`; } catch { throw new ServiceUnavailableException({ status: 'down', banco: false }); }
    const latest = await this.prisma.concurso.findFirst({ orderBy: { sincronizadoEm: 'desc' }, select: { sincronizadoEm: true } }).catch(() => null);
    const ageMinutes = latest?.sincronizadoEm ? Math.round((Date.now() - latest.sincronizadoEm.getTime()) / 60_000) : null;
    const syncOk = ageMinutes !== null && ageMinutes <= STALE_SYNC_MINUTES;
    return { status: syncOk ? 'ok' : 'degraded', service: 'bl-api', banco: true, sincronizacaoCaixa: { idadeMinutos: ageMinutes, ok: syncOk }, timestamp: new Date().toISOString() };
  }
}
