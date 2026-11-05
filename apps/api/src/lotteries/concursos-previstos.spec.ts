import { calculateBrazilCutoff, ensureUpcomingContests, nextScheduledDay, weekdayOfDay, type UpcomingDb } from '@bolaocerto/shared-types';

type Row = { modalidade: string; numeroConcurso: number; dataSorteio: Date; cutoffAt: Date; status: string; especial: string | null; fonteSincronizacao: string | null };

/** Banco em memória com só o que a projeção usa. */
function fakeDb(rows: Row[], configs: Array<{ modalidade: string; horarioCorteLocal: string; diasSemanaSorteio?: number[] }>) {
  const matches = (row: Row, where: Record<string, unknown>) => Object.entries(where).every(([key, cond]) => {
    const value = (row as unknown as Record<string, unknown>)[key];
    if (cond && typeof cond === 'object' && !(cond instanceof Date)) {
      const c = cond as Record<string, number | Date>;
      if ('gt' in c) return (value as number | Date) > c.gt!;
      if ('gte' in c) return (value as number | Date) >= c.gte!;
      return true;
    }
    return value === cond;
  });
  const db = {
    configLoteria: { findMany: async () => configs },
    concurso: {
      findFirst: jest.fn(async (args: { where: Record<string, unknown>; orderBy?: { numeroConcurso: 'desc' } }) => {
        const found = rows.filter((row) => matches(row, args.where));
        if (args.orderBy) found.sort((a, b) => b.numeroConcurso - a.numeroConcurso);
        return found[0] ?? null;
      }),
      findMany: async (args: { where: Record<string, unknown> }) => rows.filter((row) => matches(row, args.where)),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => { rows.push({ especial: null, ...(data as object) } as Row); return data; }),
    },
  };
  return { db: db as unknown as UpcomingDb, rows, create: db.concurso.create };
}
const row = (modalidade: string, numeroConcurso: number, day: string, extra: Partial<Row> = {}): Row => ({
  modalidade, numeroConcurso, dataSorteio: new Date(`${day}T20:00:00-03:00`), cutoffAt: new Date(`${day}T19:00:00-03:00`), status: 'fechado', especial: null, fonteSincronizacao: 'caixa', ...extra,
});

describe('calendário de sorteios', () => {
  it('acha o próximo dia de sorteio depois de uma data', () => {
    expect(weekdayOfDay('2026-11-04')).toBe(3); // quarta
    expect(nextScheduledDay('2026-11-04', [2, 4, 6])).toBe('2026-11-05'); // quinta
    expect(nextScheduledDay('2026-11-07', [2, 4, 6])).toBe('2026-11-10'); // sábado -> terça
    expect(nextScheduledDay('2026-11-04', [])).toBeNull();
  });
});

describe('concurso previsto para toda loteria', () => {
  // Quarta-feira, 22:53: o corte das 19h já passou e a CAIXA ainda não publicou o resultado.
  const now = new Date('2026-11-04T22:53:00-03:00');
  const config = (modalidade: string, extra: Record<string, unknown> = {}) => ({ modalidade, horarioCorteLocal: '19:00', ...extra });

  it('cria o concurso seguinte quando só existe o de hoje, já fechado', async () => {
    const { db, rows } = fakeDb([row('quina', 7001, '2026-11-04')], [config('quina', { diasSemanaSorteio: [1, 2, 3, 4, 5, 6] })]);
    const created = await ensureUpcomingContests(db, calculateBrazilCutoff, now);
    expect(created).toHaveLength(1);
    expect(created[0]).toMatchObject({ modalidade: 'quina', numeroConcurso: 7002 });
    const projected = rows.find((r) => r.numeroConcurso === 7002)!;
    expect(projected).toMatchObject({ status: 'aberto', fonteSincronizacao: 'projetado', especial: null });
    expect(projected.dataSorteio.toISOString()).toBe('2026-11-05T23:00:00.000Z'); // quinta 20:00 em Brasília
    expect(projected.cutoffAt.toISOString()).toBe('2026-11-05T22:00:00.000Z'); // quinta 19:00
  });

  it('não cria nada quando já existe concurso aberto com prazo no futuro', async () => {
    const open = row('megasena', 3001, '2026-11-05', { status: 'aberto' });
    const { db, create } = fakeDb([row('megasena', 3000, '2026-11-04'), open], [config('megasena', { diasSemanaSorteio: [2, 4, 6] })]);
    expect(await ensureUpcomingContests(db, calculateBrazilCutoff, now)).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

  it('usa os dias vistos nos concursos reais quando a configuração está vazia', async () => {
    // Lotomania real: segunda, quarta e sexta, nas últimas semanas.
    const days = ['2026-10-12', '2026-10-14', '2026-10-16', '2026-10-19', '2026-10-21', '2026-10-23', '2026-10-26', '2026-10-28', '2026-10-30', '2026-11-02'];
    const history = days.map((day, i) => row('lotomania', 2800 + i, day));
    history.push(row('lotomania', 2810, '2026-11-04'));
    const { db } = fakeDb(history, [config('lotomania')]);
    const [created] = await ensureUpcomingContests(db, calculateBrazilCutoff, now);
    expect(created).toMatchObject({ modalidade: 'lotomania', numeroConcurso: 2811 });
    expect(created!.dataSorteio.toISOString()).toBe('2026-11-06T23:00:00.000Z'); // sexta
  });

  it('sem histórico nem configuração usa o calendário padrão; Loteca sem calendário fica de fora', async () => {
    const { db, rows } = fakeDb([row('timemania', 2464, '2026-11-04'), row('loteca', 1200, '2026-11-01')], [config('timemania'), config('loteca', { horarioCorteLocal: '14:00' })]);
    const created = await ensureUpcomingContests(db, calculateBrazilCutoff, now);
    expect(created.map((c) => c.modalidade)).toEqual(['timemania']);
    expect(rows.some((r) => r.modalidade === 'loteca' && r.fonteSincronizacao === 'projetado')).toBe(false);
  });

  it('ignora concursos de festa e não repete a criação', async () => {
    const festa = row('megasena', 3100, '2026-12-31', { status: 'aberto', especial: 'mega-da-virada' });
    const { db, create } = fakeDb([row('megasena', 3000, '2026-11-04'), festa], [config('megasena', { diasSemanaSorteio: [2, 4, 6] })]);
    expect(await ensureUpcomingContests(db, calculateBrazilCutoff, now)).toHaveLength(1);
    expect(await ensureUpcomingContests(db, calculateBrazilCutoff, now)).toHaveLength(0);
    expect(create).toHaveBeenCalledTimes(1);
  });

  it('não projeta quando o último concurso é antigo demais e a data prevista já passou', async () => {
    const { db, create } = fakeDb([row('quina', 6900, '2026-10-01')], [config('quina', { diasSemanaSorteio: [1, 2, 3, 4, 5, 6] })]);
    expect(await ensureUpcomingContests(db, calculateBrazilCutoff, now)).toEqual([]);
    expect(create).not.toHaveBeenCalled();
  });

});
