/** All monetary calculations use integer cents. Rules are versioned in PostgreSQL. */
export interface PriceRule { modalidade: string; chave: string; valorCentavos: number; fonte: string }
export interface GameSelection { numeros: number[]; trevos?: number[]; colunas?: number[][]; mesSorte?: number; timeCoracao?: string }
export const NUMBER_RULES: Record<string, [number, number, number, number]> = {
  megasena: [6, 20, 1, 60], lotofacil: [15, 20, 1, 25], quina: [5, 15, 1, 80],
  duplasena: [6, 15, 1, 50], lotomania: [50, 50, 0, 99], timemania: [10, 10, 1, 80],
  diadesorte: [7, 15, 1, 31], maismilionaria: [6, 12, 1, 50],
};
export function choose(n: number, k: number): number {
  let result = 1;
  for (let i = 1; i <= k; i++) result = result * (n - i + 1) / i;
  return Math.round(result);
}
function uniqueRange(values: number[], minCount: number, maxCount: number, min: number, max: number) {
  if (!Array.isArray(values) || values.length < minCount || values.length > maxCount || new Set(values).size !== values.length || values.some(n => !Number.isInteger(n) || n < min || n > max)) throw new Error('Seleção inválida: confira quantidade, limites e números repetidos.');
}
export function selectionKey(modality: string, game: GameSelection): string {
  if (modality === 'supersete' || modality === 'loteca') {
    const columns = game.colunas;
    const length = modality === 'supersete' ? 7 : 14;
    if (!columns || columns.length !== length) throw new Error(`Informe ${length} colunas.`);
    columns.forEach(c => uniqueRange(c, 1, 3, 0, modality === 'supersete' ? 9 : 2));
    if (modality === 'loteca') {
      const doubles = columns.filter(c => c.length === 2).length;
      const triples = columns.filter(c => c.length === 3).length;
      if (2 ** doubles * 3 ** triples < 2 || 2 ** doubles * 3 ** triples > 864) throw new Error('Loteca exige de 2 a 864 apostas simples.');
      return `${doubles}d${triples}t`;
    }
    const count = columns.reduce((s, c) => s + c.length, 0);
    if (count <= 14 && columns.some(c => c.length > 2) || count > 14 && columns.some(c => c.length < 2)) throw new Error('Distribuição das colunas do Super Sete inválida.');
    return String(count);
  }
  const rule = NUMBER_RULES[modality];
  if (!rule) throw new Error('Modalidade sem matriz de apostas numéricas homologada.');
  uniqueRange(game.numeros, ...rule);
  if (modality === 'maismilionaria') { uniqueRange(game.trevos ?? [], 2, 6, 1, 6); return `${game.numeros.length}+${game.trevos!.length}`; }
  if (modality === 'diadesorte' && (!Number.isInteger(game.mesSorte) || game.mesSorte! < 1 || game.mesSorte! > 12)) throw new Error('Informe o Mês da Sorte de 1 a 12.');
  if (modality === 'timemania' && !game.timeCoracao?.trim()) throw new Error('Informe o Time do Coração.');
  return String(game.numeros.length);
}
export function splitPool(costCents: number, shares: number, feeBps: number) {
  if (![costCents, shares, feeBps].every(Number.isSafeInteger) || costCents <= 0 || shares <= 0 || feeBps < 0 || feeBps > 3500) throw new Error('Custo, cotas ou comissão inválidos.');
  // Equal quotas: reserve the ceiling cent for tickets, and explicitly report the surplus.
  const ticketPerShare = Math.ceil(costCents / shares);
  const feePerShare = Math.round(ticketPerShare * feeBps / 10000);
  const total = (ticketPerShare + feePerShare) * shares;
  if (!Number.isSafeInteger(total) || total > 9_999_999_999) throw new Error('Valor excede o limite financeiro.');
  return { costCents, shares, ticketPerShare, feePerShare, quotaCents: ticketPerShare + feePerShare,
    ticketBudgetCents: ticketPerShare * shares, roundingReserveCents: ticketPerShare * shares - costCents,
    adminTotalCents: feePerShare * shares, totalCents: total };
}
export function officialPriceRows(): PriceRule[] {
  const rows: PriceRule[] = [];
  const add = (modalidade: string, chave: string, valorCentavos: number, page = modalidade) => rows.push({ modalidade, chave, valorCentavos, fonte: `https://loterias.caixa.gov.br/Paginas/${page}.aspx` });
  const bases: Record<string, [number, string]> = { megasena: [600, 'Mega-Sena'], lotofacil: [350, 'Lotofacil'], quina: [300, 'Quina'], duplasena: [300, 'Dupla-Sena'], diadesorte: [250, 'Dia-de-Sorte'], lotomania: [300, 'Lotomania'], timemania: [350, 'Timemania'] };
  for (const [mod, [base, page]] of Object.entries(bases)) {
    const [min, max] = NUMBER_RULES[mod]!;
    for (let n = min; n <= max; n++) add(mod, String(n), base * choose(n, min), page);
  }
  for (let n = 6; n <= 12; n++) for (let t = 2; t <= 6; t++) add('maismilionaria', `${n}+${t}`, 600 * choose(n, 6) * choose(t, 2), 'Mais-Milionaria');
  for (let n = 7; n <= 21; n++) add('supersete', String(n), 300 * (n <= 14 ? 2 ** (n - 7) : 3 ** (n - 14) * 2 ** (21 - n)), 'Super-Sete');
  for (let d = 0; d <= 9; d++) for (let t = 0; t <= 6; t++) {
    const bets = 2 ** d * 3 ** t;
    if (d + t <= 14 && bets >= 2 && bets <= 864) add('loteca', `${d}d${t}t`, 200 * bets, 'Loteca');
  }
  return rows;
}
