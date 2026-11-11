import { staleProjectionIds } from '@bolaocerto/shared-types';

const day = (iso: string) => new Date(`${iso}T20:00:00-03:00`);
const row = (id: string, numeroConcurso: number, iso: string, fonteSincronizacao: string) => ({ id, numeroConcurso, dataSorteio: day(iso), fonteSincronizacao });

describe('previsões de concurso que ficaram erradas', () => {
  it('previsão no mesmo dia do concurso oficial e as seguintes são refeitas', () => {
    // Caso real: oficial #3085 em 12/11; previsões #3086 em 12/11 (repetida) e #3087 em 15/11 (numeração deslocada).
    const rows = [row('r', 3085, '2026-11-12', 'caixa'), row('p1', 3086, '2026-11-12', 'projetado'), row('p2', 3087, '2026-11-15', 'projetado')];
    expect(staleProjectionIds(rows)).toEqual(['p1', 'p2']);
  });
  it('previsões em ordem certa ficam como estão', () => {
    const rows = [row('r', 3085, '2026-11-12', 'caixa'), row('p1', 3086, '2026-11-15', 'projetado'), row('p2', 3087, '2026-11-17', 'projetado')];
    expect(staleProjectionIds(rows)).toEqual([]);
  });
  it('nunca marca concurso oficial, mesmo fora de ordem', () => {
    const rows = [row('a', 3085, '2026-11-12', 'caixa'), row('b', 3086, '2026-11-12', 'manual')];
    expect(staleProjectionIds(rows)).toEqual([]);
  });
  it('previsão no dia de outro oficial é refeita', () => {
    const rows = [row('a', 3085, '2026-11-12', 'caixa'), row('p', 3086, '2026-11-15', 'projetado'), row('b', 3087, '2026-11-15', 'caixa')];
    expect(staleProjectionIds(rows)).toEqual(['p']);
  });
  it('ignora números provisórios de festa e lista vazia', () => {
    expect(staleProjectionIds([])).toEqual([]);
    expect(staleProjectionIds([row('f', -20261231, '2026-12-31', 'manual')])).toEqual([]);
  });
});
