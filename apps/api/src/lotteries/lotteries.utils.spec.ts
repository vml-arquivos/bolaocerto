import {
  calculateBrazilCutoff,
  MODALIDADES_LOTERIA,
  normalizeCaixaContestPayload,
  parseCaixaDate,
} from '@bolaocerto/shared-types';

describe('CAIXA synchronization utilities', () => {
  it.each([
    ['30/08/2026', '2026-08-30T03:00:00.000Z'],
    ['01/09/2026', '2026-09-01T03:00:00.000Z'],
    ['31/12/2026', '2026-12-31T03:00:00.000Z'],
    ['01/01/2027', '2027-01-01T03:00:00.000Z'],
  ])('parses Brazilian date %s explicitly', (value, expected) => {
    expect(parseCaixaDate(value)?.toISOString()).toBe(expected);
  });

  it('accepts an ISO timestamp with an explicit timezone', () => {
    expect(parseCaixaDate('2026-08-30T19:00:00-03:00')?.toISOString()).toBe('2026-08-30T22:00:00.000Z');
    expect(parseCaixaDate('2026-08-30T22:00:00.000Z')?.toISOString()).toBe('2026-08-30T22:00:00.000Z');
  });

  it.each(['', '30/02/2026', '31/04/2026', '30/08/2026T19:00:00', 'not-a-date'])('rejects invalid date %s', (value) => {
    expect(parseCaixaDate(value)).toBeNull();
  });

  it('calculates the cutoff in Brazil time independent of the host timezone', () => {
    const draw = parseCaixaDate('01/09/2026');
    expect(draw).not.toBeNull();
    expect(calculateBrazilCutoff(draw!, '19:00').toISOString()).toBe('2026-09-01T22:00:00.000Z');
    expect(calculateBrazilCutoff(parseCaixaDate('31/12/2026')!, '14:00').toISOString()).toBe('2026-12-31T17:00:00.000Z');
  });

  it('normalizes the real CAIXA field names without confusing current and next contests', () => {
    const payload = normalizeCaixaContestPayload({
      numero: 3051,
      numeroConcursoProximo: 3052,
      dataApuracao: '30/08/2026',
      dataProximoConcurso: '01/09/2026',
      valorAcumuladoProximoConcurso: 29343361.52,
      valorEstimadoProximoConcurso: 36000000,
      acumulado: true,
      listaDezenas: ['11', '15', '20', '21', '38', '48'],
      dezenasSorteadasOrdemSorteio: ['11', '21', '15', '20', '48', '38'],
      listaRateioPremio: [{ faixa: 1, descricaoFaixa: '6 acertos', numeroDeGanhadores: 0, valorPremio: 0 }],
    });

    expect(payload.numeroConcursoProximo).toBe(3052);
    expect(payload.dataApuracao).toBe('30/08/2026');
    expect(payload.dataProximoConcurso).toBe('01/09/2026');
    expect(payload.valorEstimadoProximoConcurso).toBe(36000000);
    expect(payload.listaRateioPremio?.[0]?.descricaoFaixa).toBe('6 acertos');
  });

  it('keeps the nine supported modalities in the shared contract', () => {
    expect(MODALIDADES_LOTERIA).toEqual(['megasena', 'lotofacil', 'quina', 'lotomania', 'duplasena', 'timemania', 'diadesorte', 'loteca', 'supersete']);
  });
});
