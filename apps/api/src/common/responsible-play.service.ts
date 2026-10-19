import { ConflictException, ForbiddenException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from './audit.service';
import { brazilDate, round2 } from './brazil-time';
import { PrismaService } from './prisma.service';

/** Aumentar ou remover o limite só vale depois deste prazo (proteção contra decisões no impulso). */
export const LIMIT_INCREASE_DELAY_MS = 24 * 3_600_000;
export const PAUSE_OPTIONS = [30, 60, 90] as const;

type Money = Prisma.Decimal | number | string | null | undefined;
const num = (value: Money): number | null => (value === null || value === undefined ? null : Number(value));

export interface LimitFields { limiteMensal: Money; limiteMensalPendente: Money; limiteMensalPendenteEm: Date | null }

/** Limite em vigor agora: o pendente passa a valer quando o prazo de 24 h acaba. */
export function effectiveLimit(user: LimitFields, now: Date = new Date()): number | null {
  if (user.limiteMensalPendenteEm && user.limiteMensalPendenteEm.getTime() <= now.getTime()) return num(user.limiteMensalPendente);
  return num(user.limiteMensal);
}

/** Primeiro instante do mês corrente em Brasília. */
export function monthStartBrazil(now: Date = new Date()): Date {
  return new Date(`${brazilDate(now).slice(0, 7)}-01T00:00:00.000-03:00`);
}

const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const dateBr = (date: Date) => new Intl.DateTimeFormat('pt-BR', { dateStyle: 'long', timeZone: 'America/Sao_Paulo' }).format(date);

/** Ferramentas de jogo responsável: pausa da participação e limite mensal de gastos. */
@Injectable()
export class ResponsiblePlayService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async load(userId: string) {
    const user = await this.prisma.usuario.findUnique({ where: { id: userId }, select: { id: true, pausaAte: true, pausaPermanente: true, limiteMensal: true, limiteMensalPendente: true, limiteMensalPendenteEm: true } });
    if (!user) throw new ForbiddenException('Conta não encontrada.');
    return user;
  }

  /** Consolida um limite pendente cujo prazo já passou. */
  private async settlePending(user: Awaited<ReturnType<ResponsiblePlayService['load']>>, now: Date) {
    if (user.limiteMensalPendenteEm && user.limiteMensalPendenteEm.getTime() <= now.getTime()) {
      await this.prisma.usuario.update({ where: { id: user.id }, data: { limiteMensal: user.limiteMensalPendente, limiteMensalPendente: null, limiteMensalPendenteEm: null } });
      return { ...user, limiteMensal: user.limiteMensalPendente, limiteMensalPendente: null, limiteMensalPendenteEm: null };
    }
    return user;
  }

  /** Quanto a pessoa já gastou/reservou neste mês (cotas válidas; reservas vencidas não contam). */
  async spentThisMonth(userId: string, now: Date = new Date()): Promise<number> {
    const rows = await this.prisma.cota.findMany({
      where: { compradorId: userId, criadoEm: { gte: monthStartBrazil(now) }, status: { notIn: ['cancelada', 'estornada'] } },
      select: { quantidade: true, status: true, expiraReservaEm: true, bolao: { select: { valorCota: true } } },
    });
    return round2(rows.reduce((sum, row) => {
      if (row.status === 'reservada' && row.expiraReservaEm && row.expiraReservaEm.getTime() < now.getTime()) return sum;
      return sum + row.quantidade * Number(row.bolao.valorCota);
    }, 0));
  }

  async status(userId: string) {
    const now = new Date();
    const user = await this.settlePending(await this.load(userId), now);
    const limit = num(user.limiteMensal);
    const spent = await this.spentThisMonth(userId, now);
    const paused = user.pausaPermanente || Boolean(user.pausaAte && user.pausaAte.getTime() > now.getTime());
    return {
      pausada: paused, pausaPermanente: user.pausaPermanente, pausaAte: paused && !user.pausaPermanente ? user.pausaAte : null,
      limiteMensal: limit, gastoNoMes: spent, restante: limit === null ? null : Math.max(0, round2(limit - spent)),
      limitePendente: user.limiteMensalPendenteEm ? { valor: num(user.limiteMensalPendente), aplicaEm: user.limiteMensalPendenteEm } : null,
    };
  }

  /** Pausa a participação. Só aumenta o tempo, nunca reduz; a permanente só o suporte reverte. */
  async pause(userId: string, option: { dias?: number; permanente?: boolean }) {
    const now = new Date();
    const user = await this.load(userId);
    if (option.permanente) {
      await this.prisma.$transaction(async (tx) => {
        await tx.usuario.update({ where: { id: userId }, data: { pausaPermanente: true } });
        await this.audit.record(tx, { entidade: 'usuario', entidadeId: userId, evento: 'conta.pausa', atorId: userId, payloadDepois: { permanente: true } });
      });
    } else {
      if (!option.dias || !(PAUSE_OPTIONS as readonly number[]).includes(option.dias)) throw new ConflictException('Escolha 30, 60 ou 90 dias.');
      const wanted = new Date(now.getTime() + option.dias * 86_400_000);
      const until = user.pausaAte && user.pausaAte.getTime() > wanted.getTime() ? user.pausaAte : wanted;
      await this.prisma.$transaction(async (tx) => {
        await tx.usuario.update({ where: { id: userId }, data: { pausaAte: until } });
        await this.audit.record(tx, { entidade: 'usuario', entidadeId: userId, evento: 'conta.pausa', atorId: userId, payloadDepois: { dias: option.dias, ate: until.toISOString() } });
      });
    }
    return this.status(userId);
  }

  /** Definir ou diminuir o limite vale na hora; aumentar ou remover vale só depois de 24 h. */
  async setLimit(userId: string, value: number | null) {
    const now = new Date();
    const user = await this.settlePending(await this.load(userId), now);
    const current = num(user.limiteMensal);
    const wanted = value === null ? null : round2(value);
    const isStricter = wanted !== null && (current === null || wanted < current);
    let data: Prisma.UsuarioUpdateInput;
    let event: Record<string, unknown>;
    if (wanted === current) {
      data = { limiteMensalPendente: null, limiteMensalPendenteEm: null };
      event = { acao: 'cancelou_pendencia' };
    } else if (isStricter) {
      data = { limiteMensal: wanted, limiteMensalPendente: null, limiteMensalPendenteEm: null };
      event = { acao: 'definiu', de: current, para: wanted };
    } else {
      const applyAt = new Date(now.getTime() + LIMIT_INCREASE_DELAY_MS);
      data = { limiteMensalPendente: wanted, limiteMensalPendenteEm: applyAt };
      event = { acao: 'pediu_aumento', de: current, para: wanted, aplicaEm: applyAt.toISOString() };
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id: userId }, data });
      await this.audit.record(tx, { entidade: 'usuario', entidadeId: userId, evento: 'conta.limite', atorId: userId, payloadDepois: event as Prisma.InputJsonValue });
    });
    return this.status(userId);
  }

  /** Chamado antes de reservar cotas: barra quem está em pausa ou passaria do limite do mês. */
  async assertCanBuy(userId: string, poolId: string, quantity: number): Promise<void> {
    const now = new Date();
    const user = await this.settlePending(await this.load(userId), now);
    if (user.pausaPermanente) throw new ForbiddenException('Você escolheu pausar sua participação por tempo indeterminado. Para voltar, fale com o suporte.');
    if (user.pausaAte && user.pausaAte.getTime() > now.getTime()) throw new ForbiddenException(`Você pausou sua participação até ${dateBr(user.pausaAte)}. Durante a pausa não é possível reservar cotas.`);
    const limit = num(user.limiteMensal);
    if (limit === null) return;
    const pool = await this.prisma.bolao.findUnique({ where: { id: poolId }, select: { valorCota: true } });
    if (!pool) return;
    const spent = await this.spentThisMonth(userId, now);
    const cost = round2(quantity * Number(pool.valorCota));
    if (round2(spent + cost) > limit) {
      const left = Math.max(0, round2(limit - spent));
      throw new ConflictException(`Esta compra (${brl(cost)}) passa do seu limite mensal de ${brl(limit)}. Neste mês você ainda pode usar ${brl(left)}. Você pode ajustar o limite em Minha conta.`);
    }
  }
}
