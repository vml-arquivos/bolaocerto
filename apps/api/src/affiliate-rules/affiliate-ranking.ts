import { addDaysToDate, brazilDate, round2 } from '../common/brazil-time';

/** Períodos do ranking de vendas dos afiliados (datas no fuso de Brasília). */
export const RANKING_PERIODS = ['hoje', '7d', 'mes', '30d', 'ano', 'total'] as const;
export type RankingPeriod = (typeof RANKING_PERIODS)[number];

/** Início do período (null = desde sempre). */
export function rankingStart(period: RankingPeriod, now: Date = new Date()): Date | null {
  const today = brazilDate(now);
  const at = (date: string) => new Date(`${date}T00:00:00-03:00`);
  if (period === 'hoje') return at(today);
  if (period === '7d') return at(addDaysToDate(today, -6));
  if (period === '30d') return at(addDaysToDate(today, -29));
  if (period === 'mes') return at(`${today.slice(0, 7)}-01`);
  if (period === 'ano') return at(`${today.slice(0, 4)}-01-01`);
  return null;
}

export type SaleRow = { afiliadoId: string; quantidade: number; valor: number; compradorId: string; bolaoId: string; confirmadoEm: Date | null };
export type AffiliateInfo = { id: string; nome: string; codigo: string };
export type RankingRow = { posicao: number; afiliadoId: string; nome: string; codigo: string; cotas: number; vendas: number; valor: number; clientes: number; boloes: number; ultimaVenda: string | null };

/**
 * Ordena quem mais vendeu: mais cotas vendidas, depois maior valor, depois quem chegou primeiro (venda mais antiga), depois nome.
 * Empate total divide a mesma posição.
 */
export function buildRanking(sales: SaleRow[], affiliates: AffiliateInfo[]): RankingRow[] {
  const byId = new Map<string, { cotas: number; vendas: number; valor: number; clientes: Set<string>; boloes: Set<string>; primeira: number; ultima: number }>();
  for (const sale of sales) {
    const item = byId.get(sale.afiliadoId) ?? { cotas: 0, vendas: 0, valor: 0, clientes: new Set<string>(), boloes: new Set<string>(), primeira: Infinity, ultima: 0 };
    const when = sale.confirmadoEm ? sale.confirmadoEm.getTime() : 0;
    item.cotas += sale.quantidade; item.vendas += 1; item.valor += sale.valor;
    item.clientes.add(sale.compradorId); item.boloes.add(sale.bolaoId);
    item.primeira = Math.min(item.primeira, when); item.ultima = Math.max(item.ultima, when);
    byId.set(sale.afiliadoId, item);
  }
  const names = new Map(affiliates.map((affiliate) => [affiliate.id, affiliate]));
  const rows = [...byId.entries()].map(([id, item]) => ({ id, item, info: names.get(id) ?? { id, nome: 'Afiliado', codigo: '' } }));
  rows.sort((a, b) => b.item.cotas - a.item.cotas || b.item.valor - a.item.valor || a.item.primeira - b.item.primeira || a.info.nome.localeCompare(b.info.nome, 'pt-BR', { sensitivity: 'base' }));
  let position = 0;
  return rows.map((row, index) => {
    const previous = rows[index - 1];
    if (!previous || previous.item.cotas !== row.item.cotas || round2(previous.item.valor) !== round2(row.item.valor)) position = index + 1;
    return { posicao: position, afiliadoId: row.id, nome: row.info.nome, codigo: row.info.codigo, cotas: row.item.cotas, vendas: row.item.vendas, valor: round2(row.item.valor), clientes: row.item.clientes.size, boloes: row.item.boloes.size, ultimaVenda: row.item.ultima ? new Date(row.item.ultima).toISOString() : null };
  });
}
