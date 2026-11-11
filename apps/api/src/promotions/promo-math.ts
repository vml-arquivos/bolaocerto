/**
 * Contas de cupom e cashback, em centavos inteiros (nada de ponto flutuante em dinheiro).
 *
 * Regra de ouro: o desconto e o cashback saem SEMPRE da taxa de administração do BL. O dinheiro do bolão
 * (o custo dos jogos) nunca diminui, e nenhum valor passa do que a taxa permite.
 */

export type CouponKind = 'percentual' | 'valor';

export interface CouponTerms {
  tipo: CouponKind;
  /** percentual: 0,01 a 100 (% do total). valor: reais por compra. */
  valor: number;
  descontoMaximoCentavos?: number | null;
  valorMinimoCentavos?: number | null;
}

export const MAX_COUPON_PERCENT = 100;
export const MAX_CASHBACK_PERCENT = 100;

export const toCents = (reais: number): number => Math.round(reais * 100);

/** Desconto de um cupom numa compra, em centavos. 0 quando não se aplica. */
export function couponDiscountCents(terms: CouponTerms, grossCents: number, feeCents: number): number {
  if (![grossCents, feeCents].every(Number.isInteger) || grossCents <= 0 || feeCents <= 0) return 0;
  if (!Number.isFinite(terms.valor) || terms.valor <= 0) return 0;
  if (terms.valorMinimoCentavos && grossCents < terms.valorMinimoCentavos) return 0;
  let discount = terms.tipo === 'percentual'
    ? Math.floor((grossCents * Math.min(terms.valor, MAX_COUPON_PERCENT)) / 100)
    : toCents(terms.valor);
  if (terms.descontoMaximoCentavos && terms.descontoMaximoCentavos > 0) discount = Math.min(discount, terms.descontoMaximoCentavos);
  // Nunca passa da taxa de administração e nunca zera a compra.
  discount = Math.min(discount, feeCents, grossCents - 1);
  return Math.max(0, discount);
}

export interface Money { gross: number; cost: number; adminFee: number; affiliateCommission: number }

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Aplica o desconto aos valores de uma cota. O custo dos jogos não muda; o total pago e a taxa caem juntos,
 * então `gross = cost + adminFee` continua fechando. A comissão do afiliado acompanha a taxa que sobrou.
 */
export function applyDiscount(amounts: Money, discountCents: number, affiliatePct: number): Money {
  const feeCents = toCents(amounts.adminFee);
  const discount = Math.min(Math.max(Math.trunc(discountCents) || 0, 0), feeCents, Math.max(toCents(amounts.gross) - 1, 0));
  if (discount === 0) return amounts;
  const gross = round2(amounts.gross - discount / 100);
  const adminFee = round2(amounts.adminFee - discount / 100);
  return { gross, cost: amounts.cost, adminFee, affiliateCommission: round2(adminFee * (affiliatePct / 100)) };
}

export interface Audience { grupoIds: string[]; usuarioIds: string[] }

/** Cupom e campanha só valem para os grupos e clientes escolhidos. Sem ninguém escolhido, não vale para ninguém. */
export function inAudience(audience: Audience, userId: string, userGroupIds: readonly string[]): boolean {
  if (audience.usuarioIds.includes(userId)) return true;
  return audience.grupoIds.some((id) => userGroupIds.includes(id));
}

export function inPeriod(period: { inicioEm?: Date | null; fimEm?: Date | null }, now: Date): boolean {
  if (period.inicioEm && now < period.inicioEm) return false;
  if (period.fimEm && now > period.fimEm) return false;
  return true;
}

/** Código do cupom: maiúsculas, sem espaços, só letras, números, hífen e sublinhado. */
export function normalizeCouponCode(raw: string | null | undefined): string {
  return String(raw ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9_-]/g, '').slice(0, 40);
}

export interface CashbackInput {
  paidCents: number;
  feeCents: number;
  commissionCents: number;
  /** Cashback de indicação já dado nesta mesma compra (sai da mesma taxa). */
  alreadyGrantedCents?: number;
  percentual: number;
  minimumCents?: number | null;
  maxPerPurchaseCents?: number | null;
  budgetLeftCents?: number | null;
}

/** Cashback de uma campanha, em centavos: % do que foi pago, limitado ao que sobra da taxa e aos tetos da campanha. */
export function campaignCashbackCents(input: CashbackInput): number {
  const { paidCents, feeCents, commissionCents, percentual } = input;
  if (![paidCents, feeCents, commissionCents].every(Number.isInteger) || paidCents <= 0 || !Number.isFinite(percentual) || percentual <= 0) return 0;
  if (input.minimumCents && paidCents < input.minimumCents) return 0;
  const room = Math.max(0, feeCents - commissionCents - Math.max(0, input.alreadyGrantedCents ?? 0));
  let cents = Math.min(Math.floor((paidCents * Math.min(percentual, MAX_CASHBACK_PERCENT)) / 100), room);
  if (input.maxPerPurchaseCents && input.maxPerPurchaseCents > 0) cents = Math.min(cents, input.maxPerPurchaseCents);
  if (input.budgetLeftCents !== null && input.budgetLeftCents !== undefined) cents = Math.min(cents, Math.max(0, input.budgetLeftCents));
  return Math.max(0, cents);
}

/** Texto curto do que o cupom dá, para listas e avisos. */
export function describeCoupon(terms: Pick<CouponTerms, 'tipo' | 'valor'>): string {
  return terms.tipo === 'percentual' ? `${String(terms.valor).replace('.', ',')}% de desconto` : `R$ ${terms.valor.toFixed(2).replace('.', ',')} de desconto`;
}
