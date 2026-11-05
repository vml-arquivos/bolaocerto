/**
 * Preço livre do bolão (painel do administrador).
 * O registro na CAIXA (tabela ou valor digitado) é referência. O administrador define quantidade de cotas, valor da cota
 * e taxa de serviço (em % da cota ou em R$). Opcionalmente a cota nasce do registro: registro ÷ cotas + taxa.
 * O servidor refaz esta conta (pricing.engine.splitPoolByFee); aqui ela só mostra o resultado antes de salvar.
 */
/** digitar = o administrador digita o valor da cota; registro = cota calculada (registro ÷ cotas + taxa). */
export type QuotaMode = 'digitar' | 'registro';
/** pct = % da cota; cota = R$ por cota; total = R$ do bolão todo; sobra = o que sobra da cota depois do registro. */
export type FeeMode = 'pct' | 'cota' | 'total' | 'sobra';

export interface PricePlan {
  ok: true;
  costCents: number;
  shares: number;
  /** Registro na CAIXA que cabe em cada cota (arredondado para cima). */
  registroPerShare: number;
  quotaCents: number;
  feePerShare: number;
  /** Parte da cota que fica no bolão (cota menos a taxa). */
  ticketPerShare: number;
  /** Taxa de serviço em % do valor da cota. */
  feePct: number;
  feeTotalCents: number;
  /** Valor de todas as cotas vendidas. */
  totalCents: number;
  /** O que fica no bolão além do registro (inclui a sobra de arredondamento). */
  surplusCents: number;
}

export interface PriceError { ok: false; error: string }

const brl = (cents: number) => `R$ ${(cents / 100).toFixed(2).replace('.', ',')}`;

/** Converte o texto digitado ("20", "20,50", "R$ 20,50") em centavos. */
export function toCents(value: string | number): number | null {
  const number = toNumber(value);
  return number !== null && number >= 0 ? Math.round(number * 100) : null;
}

export function toNumber(value: string | number): number | null {
  const raw = String(value).replace(/[^\d.,-]/g, '').trim();
  if (!raw) return null;
  // "1.234,56" (pt-BR) ou "1234.56"
  const normalized = raw.includes(',') ? raw.replace(/\./g, '').replace(',', '.') : raw;
  const number = Number(normalized);
  return Number.isFinite(number) ? number : null;
}

export interface PlanInput { costCents: number; shares: number; quotaMode: QuotaMode; quotaValue: string; feeMode: FeeMode; feeValue: string }

export function planPricing(input: PlanInput): PricePlan | PriceError {
  const { costCents, shares, quotaMode, quotaValue, feeMode, feeValue } = input;
  if (!Number.isSafeInteger(shares) || shares < 1) return { ok: false, error: 'Informe a quantidade de cotas.' };
  if (!Number.isSafeInteger(costCents) || costCents < 0) return { ok: false, error: 'Informe o custo do registro.' };
  const registroPerShare = Math.ceil(costCents / shares);
  let quotaCents: number;
  let feePerShare: number;

  if (quotaMode === 'registro') {
    // A cota cobre o registro de cada cota e a taxa por cima. Em %, a taxa é parte da cota: cota = registro ÷ (1 − taxa).
    if (feeMode === 'sobra') return { ok: false, error: 'Para calcular a cota pelo registro, informe a taxa em % ou em R$.' };
    if (registroPerShare === 0) return { ok: false, error: 'Para calcular a cota pelo registro, informe antes o custo do registro.' };
    if (feeMode === 'pct') {
      const pct = toNumber(feeValue);
      if (pct === null || pct < 0 || pct >= 100) return { ok: false, error: 'A taxa em % precisa estar entre 0 e 99,99.' };
      quotaCents = Math.ceil(registroPerShare * 100 / (100 - pct));
    } else {
      const fee = toCents(feeValue);
      if (fee === null) return { ok: false, error: feeMode === 'cota' ? 'Informe a taxa por cota em reais.' : 'Informe a taxa total do bolão em reais.' };
      quotaCents = registroPerShare + (feeMode === 'cota' ? fee : Math.round(fee / shares));
    }
    feePerShare = quotaCents - registroPerShare;
  } else {
    const quota = toCents(quotaValue);
    if (quota === null || quota <= 0) return { ok: false, error: 'Informe o valor da cota.' };
    quotaCents = quota;
    if (feeMode === 'sobra') {
      feePerShare = quotaCents - registroPerShare;
    } else if (feeMode === 'pct') {
      const pct = toNumber(feeValue);
      if (pct === null || pct < 0 || pct > 100) return { ok: false, error: 'A taxa em % precisa estar entre 0 e 100.' };
      feePerShare = Math.round(quotaCents * pct / 100);
    } else {
      const fee = toCents(feeValue);
      if (fee === null) return { ok: false, error: feeMode === 'cota' ? 'Informe a taxa por cota em reais.' : 'Informe a taxa total do bolão em reais.' };
      feePerShare = feeMode === 'cota' ? fee : Math.round(fee / shares);
    }
  }

  if (quotaCents <= 0) return { ok: false, error: 'O valor da cota precisa ser maior que zero.' };
  if (feePerShare < 0 || quotaCents < registroPerShare) return { ok: false, error: `A cota (${brl(quotaCents)}) não cobre o registro de cada cota (${brl(registroPerShare)}).` };
  if (feePerShare > quotaCents) return { ok: false, error: `A taxa (${brl(feePerShare)}) não pode ser maior que a cota (${brl(quotaCents)}).` };
  const ticketPerShare = quotaCents - feePerShare;
  if (ticketPerShare < registroPerShare) return { ok: false, error: `Depois da taxa sobram ${brl(ticketPerShare)} por cota e o registro de cada cota custa ${brl(registroPerShare)}. Diminua a taxa ou aumente a cota.` };
  const totalCents = quotaCents * shares;
  if (!Number.isSafeInteger(totalCents) || totalCents > 9_999_999_999) return { ok: false, error: 'O valor total excede o limite permitido.' };
  return {
    ok: true, costCents, shares, registroPerShare, quotaCents, feePerShare, ticketPerShare,
    feePct: Math.round(feePerShare / quotaCents * 10000) / 100,
    feeTotalCents: feePerShare * shares,
    totalCents,
    surplusCents: ticketPerShare * shares - costCents,
  };
}
