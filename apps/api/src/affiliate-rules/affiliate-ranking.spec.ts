import { buildRanking, rankingStart } from './affiliate-ranking';

const sale = (afiliadoId: string, quantidade: number, valor: number, extra: Partial<{ compradorId: string; bolaoId: string; confirmadoEm: Date }> = {}) => ({ afiliadoId, quantidade, valor, compradorId: extra.compradorId ?? 'c1', bolaoId: extra.bolaoId ?? 'b1', confirmadoEm: extra.confirmadoEm ?? new Date('2026-11-10T12:00:00Z') });
const people = [{ id: 'a', nome: 'Ana', codigo: 'BL-A' }, { id: 'b', nome: 'Bruno', codigo: 'BL-B' }, { id: 'c', nome: 'Carla', codigo: 'BL-C' }];

describe('ranking de vendas dos afiliados', () => {
  it('quem vendeu mais cotas fica em primeiro, com totais por afiliado', () => {
    const rows = buildRanking([sale('a', 2, 40), sale('b', 5, 100, { compradorId: 'c2' }), sale('a', 1, 20, { compradorId: 'c3', bolaoId: 'b2' })], people);
    expect(rows.map((row) => [row.posicao, row.nome, row.cotas, row.valor])).toEqual([[1, 'Bruno', 5, 100], [2, 'Ana', 3, 60]]);
    expect(rows[1]).toMatchObject({ vendas: 2, clientes: 2, boloes: 2 });
  });
  it('mesmas cotas: desempata pelo valor; empate completo divide a posição', () => {
    const rows = buildRanking([sale('a', 3, 60), sale('b', 3, 90), sale('c', 3, 60)], people);
    expect(rows.map((row) => [row.posicao, row.nome])).toEqual([[1, 'Bruno'], [2, 'Ana'], [2, 'Carla']]);
  });
  it('períodos começam no fuso de Brasília', () => {
    const now = new Date('2026-11-15T02:00:00Z'); // 14/11 23:00 em Brasília
    expect(rankingStart('hoje', now)?.toISOString()).toBe('2026-11-14T03:00:00.000Z');
    expect(rankingStart('mes', now)?.toISOString()).toBe('2026-11-01T03:00:00.000Z');
    expect(rankingStart('7d', now)?.toISOString()).toBe('2026-11-08T03:00:00.000Z');
    expect(rankingStart('total', now)).toBeNull();
  });
});

import { publicName } from './affiliate-rules.controller';
describe('nome no ranking do site', () => {
  it('mostra só o primeiro nome e a inicial do sobrenome', () => {
    expect(publicName('maria souza lima')).toBe('Maria L.');
    expect(publicName('Ana')).toBe('Ana');
    expect(publicName('  ')).toBe('Afiliado');
  });
});
