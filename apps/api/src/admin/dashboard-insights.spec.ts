import { buildInsights } from './dashboard-insights';

const pay = (over: Partial<Parameters<typeof buildInsights>[0][number]> = {}) => ({ valorBruto: 20, valorTaxaAdmin: 4, valorComissaoAfiliado: 0, confirmadoEm: new Date('2026-11-12T15:30:00Z'), quantidade: 1, afiliado: false, compradorId: 'u1', bolaoId: 'b1', bolaoNome: 'Mega-Sena #3085', modalidade: 'megasena', ...over });
const funnel = { iniciadas: 10, pagas: 6, pendentes: 1, desistencias: 3 };

describe('gráficos do Resumo', () => {
  it('série diária completa (dias sem venda zerados) no horário de Brasília', () => {
    const data = buildInsights([pay(), pay({ confirmadoEm: new Date('2026-11-14T02:00:00Z'), quantidade: 2, valorBruto: 40 })], { start: new Date('2026-11-11T03:00:00Z'), end: new Date('2026-11-14T12:00:00Z'), funnel });
    expect(data.serie.map((day) => [day.data, day.valor, day.cotas])).toEqual([['2026-11-11', 0, 0], ['2026-11-12', 20, 1], ['2026-11-13', 40, 2], ['2026-11-14', 0, 0]]);
    expect(data.melhorDia?.data).toBe('2026-11-13');
    expect(data.porHora[12]).toBe(1);
    expect(data.porHora[23]).toBe(2);
  });
  it('origem, modalidades, bolões que mais venderam, clientes novos e recorrentes', () => {
    const data = buildInsights([
      pay({ afiliado: true, valorComissaoAfiliado: 2 }),
      pay({ compradorId: 'u2', bolaoId: 'b2', bolaoNome: 'Lotofácil #1', modalidade: 'lotofacil', valorBruto: 60, quantidade: 3 }),
    ], { start: new Date('2026-11-01T03:00:00Z'), end: new Date('2026-11-30T03:00:00Z'), funnel, returningIds: new Set(['u1']) });
    expect(data.origem.afiliado).toEqual({ valor: 20, cotas: 1, vendas: 1 });
    expect(data.origem.direta).toEqual({ valor: 60, cotas: 3, vendas: 1 });
    expect(data.porModalidade.map((row) => row.modalidade)).toEqual(['lotofacil', 'megasena']);
    expect(data.topBoloes[0]).toMatchObject({ id: 'b2', valor: 60, cotas: 3 });
    expect(data.totais).toMatchObject({ valor: 80, taxa: 8, comissao: 2, cotas: 4, vendas: 2, ticketMedio: 40, clientes: 2 });
    expect(data.clientes).toEqual({ novos: 1, recorrentes: 1 });
    expect(data.funil).toEqual(funnel);
  });
  it('sem vendas: tudo zerado, sem melhor dia nem melhor hora', () => {
    const data = buildInsights([], { start: new Date('2026-11-01T03:00:00Z'), end: new Date('2026-11-02T03:00:00Z'), funnel: { iniciadas: 0, pagas: 0, pendentes: 0, desistencias: 0 } });
    expect(data.melhorDia).toBeNull();
    expect(data.melhorHora).toBeNull();
    expect(data.totais.ticketMedio).toBe(0);
  });
});
