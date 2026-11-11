/**
 * Contas de cupom e cashback, em centavos inteiros (nada de ponto flutuante em dinheiro).
 *
 * Cupom: vale para quem tiver o código, de 0,01% até 100%. Enquanto o desconto cabe na taxa de administração do BL, o custo dos
 * jogos não muda. Acima da taxa (ex.: cupom de 100%), o BL banca a diferença: a taxa fica em zero e o custo registrado cai junto.
 * Cashback: sai SEMPRE da taxa de administração do BL, nunca passa do que sobra dela.
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

/** Menor valor que o provedor de pagamento aceita cobrar (R$ 5,00 por padrão, igual ao Pix/boleto da Cora), em centavos. */
export const DEFAULT_MIN_PAYABLE_CENTS = 500;
export function minPayableCents(raw: string | number | null | undefined): number {
  const value = Number(raw ?? DEFAULT_MIN_PAYABLE_CENTS / 100);
  return Number.isFinite(value) && value > 0 ? Math.round(value * 100) : DEFAULT_MIN_PAYABLE_CENTS;
}

/**
 * Desconto de um cupom numa compra, em centavos. 0 quando não se aplica.
 * Desconto que cobre o total (100%) deixa a cota grátis. Qualquer outro desconto nunca deixa o total abaixo do mínimo cobrável.
 */
export function couponDiscountCents(terms: CouponTerms, grossCents: number, minPayable: number = DEFAULT_MIN_PAYABLE_CENTS): number {
  if (!Number.isInteger(grossCents) || grossCents <= 0) return 0;
  if (!Number.isFinite(terms.valor) || terms.valor <= 0) return 0;
  if (terms.valorMinimoCentavos && grossCents < terms.valorMinimoCentavos) return 0;
  let discount = terms.tipo === 'percentual'
    ? Math.floor((grossCents * Math.min(terms.valor, MAX_COUPON_PERCENT)) / 100)
    : toCents(terms.valor);
  if (terms.descontoMaximoCentavos && terms.descontoMaximoCentavos > 0) discount = Math.min(discount, terms.descontoMaximoCentavos);
  if (discount >= grossCents) return grossCents;
  const room = grossCents - Math.max(0, Math.trunc(minPayable) || 0);
  return Math.max(0, Math.min(discount, room));
}

/** Parte do desconto que passou da taxa de administração (quem paga é o BL). */
export const subsidyCents = (discountCents: number, feeCents: number): number => Math.max(0, Math.trunc(discountCents) - Math.max(0, Math.trunc(feeCents)));

export interface Money { gross: number; cost: number; adminFee: number; affiliateCommission: number }

const round2 = (value: number) => Math.round((value + Number.EPSILON) * 100) / 100;

/**
 * Aplica o desconto aos valores de uma cota. O total pago cai pelo desconto. A taxa cai primeiro (o custo dos jogos não muda);
 * se o desconto passar da taxa, o resto sai do custo registrado, e `gross = cost + adminFee` continua fechando.
 * A comissão do afiliado acompanha a taxa que sobrou.
 */
export function applyDiscount(amounts: Money, discountCents: number, affiliatePct: number): Money {
  const grossCents = toCents(amounts.gross);
  const discount = Math.min(Math.max(Math.trunc(discountCents) || 0, 0), grossCents);
  if (discount === 0) return amounts;
  const newGross = grossCents - discount;
  const newFee = Math.max(0, toCents(amounts.adminFee) - discount);
  const adminFee = newFee / 100;
  return { gross: newGross / 100, cost: (newGross - newFee) / 100, adminFee, affiliateCommission: round2(adminFee * (affiliatePct / 100)) };
}

export interface Audience { grupoIds: string[]; usuarioIds: string[] }

/** Público escolhido (grupos e clientes). Sem ninguém escolhido, não vale para ninguém. */
export function inAudience(audience: Audience, userId: string, userGroupIds: readonly string[]): boolean {
  if (audience.usuarioIds.includes(userId)) return true;
  return audience.grupoIds.some((id) => userGroupIds.includes(id));
}

/** Nível do cliente para o cashback: quanto já gastou e quantas compras já pagou (sem contar a compra de agora). */
export interface BuyerLevel { gastoMinimoCentavos?: number | null; comprasMinimas?: number | null }
export interface BuyerStats { spentCents: number; purchases: number }

export const hasLevel = (level: BuyerLevel): boolean => Boolean(level.gastoMinimoCentavos) || Boolean(level.comprasMinimas);

/** Atingiu o nível: quando há gasto e compras mínimos, precisa dos dois. */
export function meetsLevel(level: BuyerLevel, stats: BuyerStats): boolean {
  if (!hasLevel(level)) return false;
  if (level.gastoMinimoCentavos && stats.spentCents < level.gastoMinimoCentavos) return false;
  if (level.comprasMinimas && stats.purchases < level.comprasMinimas) return false;
  return true;
}

/** Campanha de cashback vale para quem está nos grupos/clientes escolhidos OU atingiu o nível de gasto/compras da campanha. */
export function campaignApplies(campaign: Audience & BuyerLevel, userId: string, userGroupIds: readonly string[], stats: BuyerStats | null): boolean {
  if (inAudience(campaign, userId, userGroupIds)) return true;
  return stats !== null && meetsLevel(campaign, stats);
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
