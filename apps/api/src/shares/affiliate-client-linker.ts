import { Injectable, Logger, OnApplicationBootstrap, OnModuleDestroy } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { StatusCota } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';

type Row = { compradorId: string; afiliadoReferenciaId: string | null; bolao: { grupo: { id: string; afiliadoId: string | null } | null } };

/**
 * Cotista que comprou pelo afiliado é cliente dele: fica com o afiliado como origem (se ainda não tinha) e entra no grupo
 * do afiliado (o grupo do bolão, quando é do afiliado; senão o grupo principal dele). Também corrige as compras antigas.
 * Idempotente: não troca o afiliado de quem já tem um e não duplica ninguém no grupo.
 */
export async function linkAffiliateClients(prisma: PrismaService, since?: Date): Promise<{ clientes: number; membros: number }> {
  const rows = (await prisma.cota.findMany({
    where: { afiliadoReferenciaId: { not: null }, status: { notIn: [StatusCota.cancelada, StatusCota.estornada] }, comprador: { papel: 'cotista' }, ...(since ? { criadoEm: { gte: since } } : {}) },
    select: { compradorId: true, afiliadoReferenciaId: true, bolao: { select: { grupo: { select: { id: true, afiliadoId: true } } } } },
    orderBy: { criadoEm: 'asc' },
  })) as Row[];
  if (!rows.length) return { clientes: 0, membros: 0 };
  // Origem: o primeiro afiliado pelo qual a pessoa comprou.
  const firstAffiliate = new Map<string, string>();
  for (const row of rows) if (row.afiliadoReferenciaId && !firstAffiliate.has(row.compradorId)) firstAffiliate.set(row.compradorId, row.afiliadoReferenciaId);
  let clientes = 0;
  const byAffiliate = new Map<string, string[]>();
  for (const [userId, affiliateId] of firstAffiliate) byAffiliate.set(affiliateId, [...(byAffiliate.get(affiliateId) ?? []), userId]);
  for (const [affiliateId, userIds] of byAffiliate) {
    const updated = await prisma.usuario.updateMany({ where: { id: { in: userIds }, papel: 'cotista', indicadoPorAfiliadoId: null }, data: { indicadoPorAfiliadoId: affiliateId } });
    clientes += updated.count;
  }
  // Grupo: o do bolão (quando é do mesmo afiliado) ou o grupo principal do afiliado.
  const affiliateIds = [...new Set(rows.map((row) => row.afiliadoReferenciaId).filter((id): id is string => Boolean(id)))];
  const mainGroups = await prisma.grupo.findMany({ where: { afiliadoId: { in: affiliateIds } }, orderBy: { criadoEm: 'asc' }, select: { id: true, afiliadoId: true } });
  const mainGroup = new Map<string, string>();
  for (const group of mainGroups) if (group.afiliadoId && !mainGroup.has(group.afiliadoId)) mainGroup.set(group.afiliadoId, group.id);
  const pairs = new Map<string, { grupoId: string; usuarioId: string }>();
  for (const row of rows) {
    if (!row.afiliadoReferenciaId) continue;
    const groupId = row.bolao.grupo?.afiliadoId === row.afiliadoReferenciaId ? row.bolao.grupo.id : mainGroup.get(row.afiliadoReferenciaId);
    if (groupId) pairs.set(`${groupId}:${row.compradorId}`, { grupoId: groupId, usuarioId: row.compradorId });
  }
  const created = pairs.size ? await prisma.grupoMembro.createMany({ data: [...pairs.values()], skipDuplicates: true }) : { count: 0 };
  return { clientes, membros: created.count };
}

@Injectable()
export class AffiliateClientLinker implements OnApplicationBootstrap, OnModuleDestroy {
  private readonly logger = new Logger(AffiliateClientLinker.name);
  private running = false;
  private timer: NodeJS.Timeout | null = null;

  constructor(private readonly prisma: PrismaService) {}

  /** Primeira passada completa um pouco depois de o sistema subir (não atrasa a partida). */
  onApplicationBootstrap(): void {
    if (process.env.NODE_ENV === 'test') return;
    this.timer = setTimeout(() => void this.run(), 90_000);
    this.timer.unref?.();
  }

  onModuleDestroy(): void {
    if (this.timer) clearTimeout(this.timer);
  }

  /** De hora em hora confere as compras dos últimos 3 dias. */
  @Cron('17 * * * *')
  async hourly(): Promise<void> {
    await this.run(new Date(Date.now() - 3 * 24 * 60 * 60 * 1000));
  }

  async run(since?: Date): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const result = await linkAffiliateClients(this.prisma, since);
      if (result.clientes || result.membros) this.logger.log(`Clientes ligados aos afiliados: ${result.clientes} · entradas em grupos: ${result.membros}`);
    } catch (error) {
      this.logger.warn(`Não foi possível ligar os clientes aos afiliados: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }
}
