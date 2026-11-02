import { adoptProvisionalContests, brazilDayKey, contestLabel, FESTAS_PRESETS, provisionalContestNumber } from '@bolaocerto/shared-types';
import { ConfigService } from '@nestjs/config';
import { LotteriesService } from './lotteries.service';

type Row = { id: string; modalidade: string; numeroConcurso: number; dataSorteio: Date; numeroDefinido: boolean; especial: string | null; nomeEspecial: string | null; valorEstimadoPremio?: number | null; status?: string };
type Pool = { id: string; concursoId: string };

function makeDb(rows: Row[], pools: Pool[] = []) {
  const db = {
    rows, pools,
    concurso: {
      findMany: jest.fn(async ({ where }: { where: Record<string, unknown> }) => rows.filter((r) => Object.entries(where).every(([k, v]) => (v && typeof v === 'object' && 'not' in (v as object)) ? (r as never)[k] !== null : (r as never)[k] === v))),
      findUnique: jest.fn(async ({ where }: { where: Record<string, any> }) => where.id ? rows.find((r) => r.id === where.id) ?? null : rows.find((r) => r.modalidade === where.modalidade_numeroConcurso.modalidade && r.numeroConcurso === where.modalidade_numeroConcurso.numeroConcurso) ?? null),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id)!),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => { const row = rows.find((r) => r.id === where.id)!; Object.assign(row, data); return row; }),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => { rows.splice(rows.findIndex((r) => r.id === where.id), 1); }),
      create: jest.fn(async ({ data }: { data: Omit<Row, 'id'> }) => { const row = { id: `c${rows.length + 1}`, ...data } as Row; rows.push(row); return row; }),
    },
    bolao: { updateMany: jest.fn(async ({ where, data }: { where: { concursoId: string }; data: { concursoId: string } }) => { const hit = pools.filter((p) => p.concursoId === where.concursoId); hit.forEach((p) => { p.concursoId = data.concursoId; }); return { count: hit.length }; }) },
    configLoteria: { findUnique: jest.fn(async () => ({ horarioCorteLocal: '19:00' })) },
    $transaction: async (cb: (t: unknown) => Promise<unknown>) => cb(db),
  };
  return db;
}
const virada = new Date('2026-12-31T20:00:00-03:00');
const provisional = (extra: Partial<Row> = {}): Row => ({ id: 'p1', modalidade: 'megasena', numeroConcurso: provisionalContestNumber(virada), dataSorteio: virada, numeroDefinido: false, especial: 'mega-da-virada', nomeEspecial: 'Mega da Virada', ...extra });

describe('concursos de festa', () => {
  it('número provisório é negativo e único por dia; rótulo fala "a definir"', () => {
    expect(provisionalContestNumber(virada)).toBe(-20261231);
    expect(brazilDayKey(new Date('2027-01-01T01:30:00Z'))).toBe('2026-12-31'); // ainda é 31/12 em Brasília
    expect(contestLabel({ numeroConcurso: -20261231, numeroDefinido: false, nomeEspecial: 'Mega da Virada' })).toBe('Mega da Virada · concurso a definir');
    expect(contestLabel({ numeroConcurso: 2980, numeroDefinido: true, nomeEspecial: 'Mega da Virada' })).toBe('Mega da Virada · concurso 2980');
    expect(contestLabel({ numeroConcurso: 2900 })).toBe('Concurso 2900');
    expect(FESTAS_PRESETS.find((p) => p.chave === 'mega-da-virada')?.modalidade).toBe('megasena');
  });

  it('o oficial da mesma data assume o provisório (sem duplicar) e os bolões continuam no mesmo concurso', async () => {
    const db = makeDb([provisional()], [{ id: 'b1', concursoId: 'p1' }]);
    const adopted = await adoptProvisionalContests(db as never, 'megasena', 2980, new Date('2026-12-31T00:00:00-03:00'));
    expect(adopted).toBe(1);
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]).toMatchObject({ id: 'p1', numeroConcurso: 2980, numeroDefinido: true, especial: 'mega-da-virada' });
    expect(db.pools[0]!.concursoId).toBe('p1');
  });

  it('se o oficial já existe, os bolões migram para ele e ele herda o nome da festa', async () => {
    const real: Row = { id: 'r1', modalidade: 'megasena', numeroConcurso: 2980, dataSorteio: virada, numeroDefinido: true, especial: null, nomeEspecial: null };
    const db = makeDb([provisional(), real], [{ id: 'b1', concursoId: 'p1' }, { id: 'b2', concursoId: 'p1' }]);
    await adoptProvisionalContests(db as never, 'megasena', 2980, virada);
    expect(db.rows.map((r) => r.id)).toEqual(['r1']);
    expect(db.rows[0]).toMatchObject({ nomeEspecial: 'Mega da Virada', especial: 'mega-da-virada' });
    expect(db.pools.every((p) => p.concursoId === 'r1')).toBe(true);
  });

  it('não mexe em outra modalidade, outro dia ou número inválido', async () => {
    const db = makeDb([provisional()]);
    expect(await adoptProvisionalContests(db as never, 'quina', 6900, virada)).toBe(0);
    expect(await adoptProvisionalContests(db as never, 'megasena', 2979, new Date('2026-12-29T20:00:00-03:00'))).toBe(0);
    expect(await adoptProvisionalContests(db as never, 'megasena', 0, virada)).toBe(0);
    expect(db.rows[0]!.numeroDefinido).toBe(false);
  });
});

describe('LotteriesService.createFestival / updateFestival', () => {
  const svc = (rows: Row[] = [], pools: Pool[] = []) => { const db = makeDb(rows, pools); return { db, service: new LotteriesService(db as never, { get: () => undefined } as unknown as ConfigService) }; };
  const future = () => { const d = new Date(Date.now() + 60 * 86_400_000); return brazilDayKey(d); };

  it('cria a Mega da Virada sem número oficial e sem prêmio, já aberta', async () => {
    const { service, db } = svc();
    const day = future();
    const out = await service.createFestival({ especial: 'mega-da-virada', dataSorteio: day }, 'admin1');
    expect(out).toMatchObject({ modalidade: 'megasena', nomeEspecial: 'Mega da Virada', numeroDefinido: false, valorEstimadoPremio: null });
    expect(out.numeroConcurso).toBeLessThan(0);
    expect(db.rows[0]).toMatchObject({ status: 'aberto', especial: 'mega-da-virada' });
  });

  it('com número oficial já nasce definido; repetir a mesma festa dá conflito', async () => {
    const { service } = svc();
    const day = future();
    const out = await service.createFestival({ especial: 'mega-sao-joao', dataSorteio: day, numeroConcurso: 3100, valorEstimadoPremio: 50_000_000 }, 'a');
    expect(out).toMatchObject({ numeroConcurso: 3100, numeroDefinido: true });
    await expect(service.createFestival({ especial: 'mega-sao-joao', dataSorteio: day, numeroConcurso: 3100 }, 'a')).rejects.toThrow(/já está cadastrado/);
  });

  it('personalizado exige modalidade e nome; data passada e preset inválido são recusados', async () => {
    const { service } = svc();
    await expect(service.createFestival({ especial: 'personalizado', dataSorteio: future() }, 'a')).rejects.toThrow();
    await expect(service.createFestival({ especial: 'personalizado', modalidade: 'quina', dataSorteio: future() }, 'a')).rejects.toThrow(/nome da festa/);
    await expect(service.createFestival({ especial: 'personalizado', modalidade: 'quina', nomeEspecial: 'Quina do Natal', dataSorteio: future() }, 'a')).resolves.toMatchObject({ nomeEspecial: 'Quina do Natal' });
    await expect(service.createFestival({ especial: 'mega-da-virada', dataSorteio: '2020-01-01' }, 'a')).rejects.toThrow(/futura/);
    await expect(service.createFestival({ especial: 'inexistente', dataSorteio: future() }, 'a')).rejects.toThrow(/lista/);
  });

  it('informar o número oficial depois: vira definido; se o oficial já existe, unifica', async () => {
    const day = future();
    const { service, db } = svc();
    const created = await service.createFestival({ especial: 'mega-da-virada', dataSorteio: day }, 'a');
    const done = await service.updateFestival(created.id, { numeroConcurso: 2990, valorEstimadoPremio: 600_000_000 }, 'a');
    expect(done).toMatchObject({ numeroConcurso: 2990, numeroDefinido: true });
    await expect(service.updateFestival(created.id, { numeroConcurso: 2991 }, 'a')).rejects.toThrow(/já tem número oficial/);
    expect(db.rows).toHaveLength(1);

    const day2 = brazilDayKey(new Date(Date.now() + 90 * 86_400_000));
    const second = svc([{ id: 'r1', modalidade: 'megasena', numeroConcurso: 3000, dataSorteio: new Date(`${day2}T20:00:00-03:00`), numeroDefinido: true, especial: null, nomeEspecial: null }], [{ id: 'b1', concursoId: 'c2' }]);
    const prov = await second.service.createFestival({ especial: 'mega-pascoa', dataSorteio: day2 }, 'a');
    expect(prov.id).toBe('c2');
    second.db.pools[0]!.concursoId = prov.id;
    const unified = await second.service.updateFestival(prov.id, { numeroConcurso: 3000 }, 'a');
    expect(unified).toMatchObject({ id: 'r1', numeroConcurso: 3000, nomeEspecial: 'Mega de Páscoa' });
    expect(second.db.pools[0]!.concursoId).toBe('r1');
    await expect(second.service.updateFestival('nao-existe', { numeroConcurso: 1 }, 'a')).rejects.toThrow(/não encontrado/);
  });
});
