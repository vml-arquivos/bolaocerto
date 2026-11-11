import { ConflictException } from '@nestjs/common';
import { Prisma, StatusCota } from '@prisma/client';
import { couponDiscountCents, describeCoupon, DEFAULT_MIN_PAYABLE_CENTS, inAudience, inPeriod, normalizeCouponCode, subsidyCents } from './promo-math';

type Db = Prisma.TransactionClient;

/** Cota que ainda segura um uso do cupom: paga, ou reservada e dentro do prazo. Reserva vencida ou cota cancelada devolve o uso. */
export const holdsCouponUse = (now: Date): Prisma.CotaWhereInput => ({
  OR: [
    { status: { in: [StatusCota.paga, StatusCota.registrada, StatusCota.apurada, StatusCota.premiada] } },
    { status: StatusCota.reservada, expiraReservaEm: { gt: now } },
  ],
});

export interface AppliedCoupon { cupomId: string; codigo: string; descricao: string; descontoCentavos: number; automatico: boolean }

/** O cupom tem público escolhido (grupos/clientes)? Sem público, vale para qualquer pessoa que tenha o código. */
const hasAudience = (coupon: { grupoIds: string[]; usuarioIds: string[] }) => coupon.grupoIds.length > 0 || coupon.usuarioIds.length > 0;

export async function userGroupIds(db: Pick<Db, 'grupoMembro'>, userId: string): Promise<string[]> {
  const rows = await db.grupoMembro.findMany({ where: { usuarioId: userId }, select: { grupoId: true } });
  return rows.map((row) => row.grupoId);
}

type CouponRow = Prisma.CupomGetPayload<Record<string, never>>;

const terms = (coupon: CouponRow) => ({ tipo: coupon.tipo as 'percentual' | 'valor', valor: Number(coupon.valor), descontoMaximoCentavos: coupon.descontoMaximoCentavos, valorMinimoCentavos: coupon.valorMinimoCentavos });

const GENERIC = 'Este cupom não é válido para a sua conta ou não existe. Confira o código.';

/** Confere tudo de um cupom para esta pessoa e esta compra. Devolve o motivo em português quando não vale. */
export async function checkCoupon(db: Db, coupon: CouponRow, input: { userId: string; groups: string[]; grossCents: number; feeCents?: number; now: Date; code?: string; minPayableCents?: number }): Promise<{ ok: true; discount: number } | { ok: false; reason: string; audience: boolean }> {
  // Quem não está no público não descobre nada sobre o cupom.
  if (!coupon.ativo || (hasAudience(coupon) && !inAudience({ grupoIds: coupon.grupoIds, usuarioIds: coupon.usuarioIds }, input.userId, input.groups))) return { ok: false, reason: GENERIC, audience: false };
  if (coupon.inicioEm && input.now < coupon.inicioEm) return { ok: false, reason: 'Este cupom ainda não começou a valer.', audience: true };
  if (!inPeriod(coupon, input.now)) return { ok: false, reason: 'Este cupom já venceu.', audience: true };
  const live = holdsCouponUse(input.now);
  if (coupon.limiteTotal !== null) {
    const used = await db.cupomUso.count({ where: { cupomId: coupon.id, cota: live } });
    if (used >= coupon.limiteTotal) return { ok: false, reason: 'Este cupom já foi usado o máximo de vezes.', audience: true };
  }
  if (coupon.limitePorCliente !== null) {
    const mine = await db.cupomUso.count({ where: { cupomId: coupon.id, usuarioId: input.userId, cota: live } });
    if (mine >= coupon.limitePorCliente) return { ok: false, reason: coupon.limitePorCliente === 1 ? 'Você já usou este cupom.' : `Você já usou este cupom ${coupon.limitePorCliente} vezes, que é o limite.`, audience: true };
  }
  if (coupon.valorMinimoCentavos && input.grossCents < coupon.valorMinimoCentavos) {
    return { ok: false, reason: `Este cupom vale para compras a partir de R$ ${(coupon.valorMinimoCentavos / 100).toFixed(2).replace('.', ',')}.`, audience: true };
  }
  const discount = couponDiscountCents(terms(coupon), input.grossCents, input.minPayableCents ?? DEFAULT_MIN_PAYABLE_CENTS);
  if (discount <= 0) return { ok: false, reason: 'Este cupom não gera desconto nesta compra.', audience: true };
  return { ok: true, discount };
}

/**
 * Qual cupom vale nesta compra. Com código: esse cupom, ou erro claro. Sem código: o automático de maior desconto, se houver.
 * Dentro da transação da reserva: o cupom é travado para dois pedidos ao mesmo tempo não passarem do limite.
 */
export async function resolveCoupon(tx: Db, input: { userId: string; code?: string | null; grossCents: number; feeCents?: number; now?: Date; lock?: boolean; minPayableCents?: number }): Promise<AppliedCoupon | null> {
  const now = input.now ?? new Date();
  const code = normalizeCouponCode(input.code);
  const groups = await userGroupIds(tx, input.userId);
  const lock = async (id: string) => { if (input.lock !== false) await tx.$queryRaw`SELECT id FROM cupons WHERE id = ${id}::uuid FOR UPDATE`; };

  if (code) {
    const coupon = await tx.cupom.findUnique({ where: { codigo: code } });
    if (!coupon) throw new ConflictException(GENERIC);
    await lock(coupon.id);
    const fresh = await tx.cupom.findUniqueOrThrow({ where: { id: coupon.id } });
    const result = await checkCoupon(tx, fresh, { userId: input.userId, groups, grossCents: input.grossCents, feeCents: input.feeCents, minPayableCents: input.minPayableCents, now });
    if (!result.ok) throw new ConflictException(result.reason);
    return { cupomId: fresh.id, codigo: fresh.codigo, descricao: describeCoupon(terms(fresh)), descontoCentavos: result.discount, automatico: false };
  }

  const candidates = await tx.cupom.findMany({ where: { ativo: true, automatico: true, OR: [{ usuarioIds: { has: input.userId } }, ...(groups.length ? [{ grupoIds: { hasSome: groups } }] : [])] }, take: 50 });
  let best: AppliedCoupon | null = null;
  for (const candidate of candidates) {
    if (!hasAudience(candidate)) continue; // automático sem público nunca é aplicado sozinho
    const check = await checkCoupon(tx, candidate, { userId: input.userId, groups, grossCents: input.grossCents, feeCents: input.feeCents, minPayableCents: input.minPayableCents, now });
    if (check.ok && (!best || check.discount > best.descontoCentavos)) best = { cupomId: candidate.id, codigo: candidate.codigo, descricao: describeCoupon(terms(candidate)), descontoCentavos: check.discount, automatico: true };
  }
  if (!best) return null;
  // O melhor foi escolhido sem trava; trava e confere de novo antes de usar.
  await lock(best.cupomId);
  const fresh = await tx.cupom.findUniqueOrThrow({ where: { id: best.cupomId } });
  const again = await checkCoupon(tx, fresh, { userId: input.userId, groups, grossCents: input.grossCents, feeCents: input.feeCents, minPayableCents: input.minPayableCents, now });
  return again.ok ? { ...best, descontoCentavos: again.discount } : null;
}

/** Registra o uso do cupom na cota recém-criada. */
export async function recordCouponUse(tx: Db, input: { cupomId: string; cotaId: string; usuarioId: string; descontoCentavos: number; feeCents?: number }): Promise<void> {
  await tx.cupomUso.create({ data: { cupomId: input.cupomId, cotaId: input.cotaId, usuarioId: input.usuarioId, descontoCentavos: input.descontoCentavos, subsidioCentavos: subsidyCents(input.descontoCentavos, input.feeCents ?? input.descontoCentavos) } });
}
