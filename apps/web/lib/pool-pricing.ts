/**
 * Preço livre do bolão (painel do administrador).
 * O custo do registro na CAIXA é só referência. O valor da cota é definido por quem cria o bolão e o que sobra depois da parte do registro é a taxa de serviço.
 * O servidor refaz esta conta (pricing.engine.splitPoolByQuota); aqui ela só mostra o resultado antes de salvar.
 */
export type PriceMode = 'cota' | 'pct' | 'taxa_cota' | 'taxa_total';

export interface PricePlan {
  ok: true;
  costCents: number;
  shares: number;
  /** Parte do registro em cada cota (arredondada para cima). */
  ticketPerShare: number;
  quotaCents: number;
  feePerShare: number;
  /** Taxa de serviço em % do valor da cota. */
  feePct: number;
  feeTotalCents: number;
  /** Valor de todas as cotas vendidas. */
  totalCents: number;
  /** Sobra do arredondamento do registro (fica na parte do registro, não vira taxa). */
  reserveCents: number;
}

export interface PriceError { ok: false; error: string }

/** Converte o texto digitado ("20", "20,50", "R$ 20,50") em centavos. */
export function toCents(value: string | number): number | null {
  const raw = String(value).replace(/[^\d.,-]/g, '').trim();
  if (!raw) return null;
  // "1.234,56" (pt-BR) ou "1234.56"
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const number = Number(normalized);
  return Number.isFinite(number) && number >= 0 ? Math.round(number * 100) : null;
}

export function toNumber(value: string | number): number | null {
  const raw = String(value).replace(/[^\d.,-]/g, '').trim();
  if (!raw) return null;
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export function planPricing(input: { costCents: number; shares: number; mode: PriceMode; value: string }): PricePlan | PriceError {
  const { costCents, shares, mode, value } = input;
  if (!Number.isSafeInteger(shares) || shares < 1) return { ok: false, error: 'Informe o total de cotas.' };
  if (!Number.isSafeInteger(costCents) || costCents < 0) return { ok: false, error: 'Informe o custo do registro.' };
  const ticketPerShare = Math.ceil(costCents / shares);
  let quotaCents: number;
  if (mode === 'pct') {
    const pct = toNumber(value);
    if (pct === null || pct < 0 || pct >= 100) return { ok: false, error: 'A taxa em % precisa estar entre 0 e 99,99.' };
    if (ticketPerShare === 0) return { ok: false, error: 'Para definir a taxa em %, informe antes o custo do registro.' };
    quotaCents = Math.ceil(ticketPerShare * 100 / (100 - pct));
  } else if (mode === 'taxa_cota') {
    const fee = toCents(value);
    if (fee === null) return { ok: false, error: 'Informe a taxa por cota em reais.' };
    quotaCents = ticketPerShare + fee;
  } else if (mode === 'taxa_total') {
    const total = toCents(value);
    if (total === null) return { ok: false, error: 'Informe a taxa total do bolão em reais.' };
    quotaCents = ticketPerShare + Math.round(total / shares);
  } else {
    const quota = toCents(value);
    if (quota === null) return { ok: false, error: 'Informe o valor da cota.' };
    quotaCents = quota;
  }
  if (quotaCents <= 0) return { ok: false, error: 'O valor da cota precisa ser maior que zero.' };
  if (quotaCents < ticketPerShare) return { ok: false, error: `A cota precisa cobrir ao menos a parte do registro de cada cota (${(ticketPerShare / 100).toFixed(2).replace('.', ',')}).` };
  const feePerShare = quotaCents - ticketPerShare;
  const totalCents = quotaCents * shares;
  if (!Number.isSafeInteger(totalCents) || totalCents > 9_999_999_999) return { ok: false, error: 'O valor total excede o limite permitido.' };
  return {
    ok: true, costCents, shares, ticketPerShare, quotaCents, feePerShare,
    feePct: Math.round(feePerShare / quotaCents * 10000) / 100,
    feeTotalCents: feePerShare * shares,
    totalCents,
    reserveCents: ticketPerShare * shares - costCents,
  };
}
