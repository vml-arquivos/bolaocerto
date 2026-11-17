/**
 * Extrato de comissões por afiliado: junta as comissões (uma por cota vendida) numa linha por afiliado,
 * com o total a receber, a quantidade e o extrato com cada cota. Serve para as abas "A pagar", "Pagas" e "Canceladas".
 * Datas no horário de Brasília (-03:00).
 */
export type StatementCommission = {
  id: string;
  afiliadoId: string;
  afiliadoNome: string;
  afiliadoCodigo: string | null;
  chavePix: string | null;
  valor: number;
  baseCalculo: number | null;
  percentual: number | null;
  status: string;
  criadoEm: Date;
  pagoEm: Date | null;
  lote: { id: string; codigo: string; status: string } | null;
  comprador: string;
  cotaId: string;
  bolao: { modalidade: string; numeroConcurso: number; valorCota: string } | null;
  grupo: string | null;
};

export type StatementFilters = { status?: string; afiliadoId?: string; mes?: string; de?: string; ate?: string; data?: 'venda' | 'pagamento' };

const round2 = (value: number) => Math.round(value * 100) / 100;

/** Converte mês (AAAA-MM) e período (AAAA-MM-DD) em um intervalo de datas no horário de Brasília. */
export function statementRange(filters: StatementFilters): { gte?: Date; lt?: Date } {
  const range: { gte?: Date; lt?: Date } = {};
  if (filters.mes && /^\d{4}-\d{2}$/.test(filters.mes)) {
    const [year, month] = filters.mes.split('-').map(Number) as [number, number];
    range.gte = new Date(`${filters.mes}-01T00:00:00-03:00`);
    range.lt = new Date(`${month === 12 ? year + 1 : year}-${String(month === 12 ? 1 : month + 1).padStart(2, '0')}-01T00:00:00-03:00`);
  }
  if (filters.de && /^\d{4}-\d{2}-\d{2}$/.test(filters.de)) {
    const start = new Date(`${filters.de}T00:00:00-03:00`);
    if (!range.gte || start > range.gte) range.gte = start;
  }
  if (filters.ate && /^\d{4}-\d{2}-\d{2}$/.test(filters.ate)) {
    const end = new Date(new Date(`${filters.ate}T00:00:00-03:00`).getTime() + 24 * 60 * 60 * 1000);
    if (!range.lt || end < range.lt) range.lt = end;
  }
  return range;
}

const monthKey = (date: Date) => new Date(date.getTime() - 3 * 60 * 60 * 1000).toISOString().slice(0, 7);

export function buildCommissionStatement(rows: StatementCommission[]) {
  const groups = new Map<string, {
    afiliadoId: string; nome: string; codigo: string | null; chavePix: string | null;
    total: number; quantidade: number; livre: number; emLote: number; idsLivres: string[];
    meses: Map<string, { mes: string; total: number; quantidade: number }>;
    ultimaData: Date | null;
    itens: Array<Record<string, unknown>>;
  }>();
  for (const row of rows) {
    let group = groups.get(row.afiliadoId);
    if (!group) {
      group = { afiliadoId: row.afiliadoId, nome: row.afiliadoNome, codigo: row.afiliadoCodigo, chavePix: row.chavePix, total: 0, quantidade: 0, livre: 0, emLote: 0, idsLivres: [], meses: new Map(), ultimaData: null, itens: [] };
      groups.set(row.afiliadoId, group);
    }
    group.total += row.valor;
    group.quantidade += 1;
    if (row.status === 'pendente') {
      if (row.lote) group.emLote += row.valor;
      else { group.livre += row.valor; group.idsLivres.push(row.id); }
    }
    const key = monthKey(row.criadoEm);
    const month = group.meses.get(key) ?? { mes: key, total: 0, quantidade: 0 };
    month.total += row.valor; month.quantidade += 1;
    group.meses.set(key, month);
    if (!group.ultimaData || row.criadoEm > group.ultimaData) group.ultimaData = row.criadoEm;
    group.itens.push({
      id: row.id, cotaId: row.cotaId, comprador: row.comprador, bolao: row.bolao, grupo: row.grupo,
      baseCalculo: row.baseCalculo === null ? null : round2(row.baseCalculo).toFixed(2),
      percentual: row.percentual === null ? null : round2(row.percentual).toFixed(2),
      valor: round2(row.valor).toFixed(2), status: row.status, criadoEm: row.criadoEm, pagoEm: row.pagoEm, lote: row.lote,
    });
  }
  const afiliados = [...groups.values()]
    .map((group) => ({
      afiliadoId: group.afiliadoId, nome: group.nome, codigo: group.codigo, chavePix: group.chavePix,
      total: round2(group.total).toFixed(2), quantidade: group.quantidade,
      livre: round2(group.livre).toFixed(2), emLote: round2(group.emLote).toFixed(2), idsLivres: group.idsLivres,
      ultimaData: group.ultimaData,
      meses: [...group.meses.values()].sort((a, b) => b.mes.localeCompare(a.mes)).map((month) => ({ mes: month.mes, total: round2(month.total).toFixed(2), quantidade: month.quantidade })),
      itens: group.itens.sort((a, b) => (b.criadoEm as Date).getTime() - (a.criadoEm as Date).getTime()),
    }))
    .sort((a, b) => Number(b.total) - Number(a.total) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const total = rows.reduce((sum, row) => sum + row.valor, 0);
  return { total: round2(total).toFixed(2), quantidade: rows.length, afiliados };
}
