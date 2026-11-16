/**
 * Indicadores visuais do Resumo (gráficos e infográficos): vendas por dia, por modalidade, origem (afiliado x venda direta),
 * bolões que mais venderam, funil de pagamento, horário e dia da semana das vendas e clientes novos x recorrentes.
 * Tudo calculado em memória a partir dos pagamentos confirmados do período (datas no horário de Brasília).
 */
export type InsightPayment = {
  valorBruto: number;
  valorTaxaAdmin: number;
  valorComissaoAfiliado: number;
  confirmadoEm: Date | null;
  quantidade: number;
  afiliado: boolean;
  compradorId: string;
  bolaoId: string;
  bolaoNome: string;
  modalidade: string;
};

const round2 = (value: number) => Math.round(value * 100) / 100;
const BRT_OFFSET_MS = 3 * 60 * 60 * 1000;
const brt = (date: Date) => new Date(date.getTime() - BRT_OFFSET_MS);

export function buildInsights(payments: InsightPayment[], options: { start: Date; end: Date; returningIds?: Set<string>; funnel: { iniciadas: number; pagas: number; pendentes: number; desistencias: number } }) {
  // Série diária com todos os dias do período (dias sem venda aparecem zerados).
  const days = new Map<string, { data: string; valor: number; cotas: number; vendas: number }>();
  const first = brt(options.start); first.setUTCHours(0, 0, 0, 0);
  const last = brt(options.end);
  for (let cursor = new Date(first); cursor <= last && days.size < 400; cursor.setUTCDate(cursor.getUTCDate() + 1)) {
    const key = cursor.toISOString().slice(0, 10);
    days.set(key, { data: key, valor: 0, cotas: 0, vendas: 0 });
  }
  const byModality = new Map<string, { modalidade: string; valor: number; cotas: number }>();
  const byPool = new Map<string, { id: string; nome: string; modalidade: string; valor: number; cotas: number }>();
  const origin = { afiliado: { valor: 0, cotas: 0, vendas: 0 }, direta: { valor: 0, cotas: 0, vendas: 0 } };
  const hours = Array.from({ length: 24 }, () => 0);
  const weekdays = Array.from({ length: 7 }, () => 0);
  const buyers = new Set<string>();
  let total = 0; let fee = 0; let commission = 0; let shares = 0;

  for (const payment of payments) {
    total += payment.valorBruto; fee += payment.valorTaxaAdmin; commission += payment.valorComissaoAfiliado; shares += payment.quantidade;
    buyers.add(payment.compradorId);
    if (payment.confirmadoEm) {
      const local = brt(payment.confirmadoEm);
      const key = local.toISOString().slice(0, 10);
      const day = days.get(key) ?? { data: key, valor: 0, cotas: 0, vendas: 0 };
      day.valor += payment.valorBruto; day.cotas += payment.quantidade; day.vendas += 1;
      days.set(key, day);
      hours[local.getUTCHours()]! += payment.quantidade;
      weekdays[local.getUTCDay()]! += payment.quantidade;
    }
    const modality = byModality.get(payment.modalidade) ?? { modalidade: payment.modalidade, valor: 0, cotas: 0 };
    modality.valor += payment.valorBruto; modality.cotas += payment.quantidade;
    byModality.set(payment.modalidade, modality);
    const pool = byPool.get(payment.bolaoId) ?? { id: payment.bolaoId, nome: payment.bolaoNome, modalidade: payment.modalidade, valor: 0, cotas: 0 };
    pool.valor += payment.valorBruto; pool.cotas += payment.quantidade;
    byPool.set(payment.bolaoId, pool);
    const side = payment.afiliado ? origin.afiliado : origin.direta;
    side.valor += payment.valorBruto; side.cotas += payment.quantidade; side.vendas += 1;
  }

  const returning = options.returningIds ?? new Set<string>();
  const recorrentes = [...buyers].filter((id) => returning.has(id)).length;
  const serie = [...days.values()].sort((a, b) => a.data.localeCompare(b.data)).map((day) => ({ ...day, valor: round2(day.valor) }));
  const bestDay = serie.reduce<(typeof serie)[number] | null>((best, day) => (!best || day.valor > best.valor ? day : best), null);
  const bestHour = hours.reduce((best, value, index) => (value > hours[best]! ? index : best), 0);
  return {
    totais: { valor: round2(total), taxa: round2(fee), comissao: round2(commission), cotas: shares, vendas: payments.length, ticketMedio: payments.length ? round2(total / payments.length) : 0, clientes: buyers.size },
    serie,
    melhorDia: bestDay && bestDay.valor > 0 ? bestDay : null,
    porModalidade: [...byModality.values()].map((row) => ({ ...row, valor: round2(row.valor) })).sort((a, b) => b.valor - a.valor),
    origem: { afiliado: { ...origin.afiliado, valor: round2(origin.afiliado.valor) }, direta: { ...origin.direta, valor: round2(origin.direta.valor) } },
    topBoloes: [...byPool.values()].map((row) => ({ ...row, valor: round2(row.valor) })).sort((a, b) => b.valor - a.valor || b.cotas - a.cotas).slice(0, 5),
    funil: options.funnel,
    porHora: hours,
    melhorHora: shares ? bestHour : null,
    porDiaSemana: weekdays,
    clientes: { novos: buyers.size - recorrentes, recorrentes },
  };
}
