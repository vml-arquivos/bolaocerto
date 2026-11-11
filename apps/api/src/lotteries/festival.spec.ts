import { healBrokenFestivals } from './festival-guard';
import { adoptProvisionalContests, brazilDayKey, contestLabel, FESTAS_PRESETS, previsaoFesta, proximoSorteioFesta, provisionalContestNumber } from '@bolaocerto/shared-types';
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
      // Último número já sorteado: sorteio no passado, ou apurado sem ser festa.
      findFirst: jest.fn(async ({ where }: { where: { modalidade: string } }) => {
        const drawn = rows.filter((r) => r.modalidade === where.modalidade && r.numeroConcurso > 0 && (r.dataSorteio.getTime() <= Date.now() || ((r as never as { status?: string }).status === 'apurado' && !r.especial))).sort((x, y) => y.numeroConcurso - x.numeroConcurso);
        return drawn[0] ? { numeroConcurso: drawn[0].numeroConcurso } : null;
      }),
      findUniqueOrThrow: jest.fn(async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id)!),
      update: jest.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => { const row = rows.find((r) => r.id === where.id)!; Object.assign(row, data); return row; }),
      delete: jest.fn(async ({ where }: { where: { id: string } }) => { rows.splice(rows.findIndex((r) => r.id === where.id), 1); }),
      create: jest.fn(async ({ data }: { data: Omit<Row, 'id'> }) => { const row = { id: `c${rows.length + 1}`, ...data } as Row; rows.push(row); return row; }),
    },
    bolao: { count: jest.fn(async () => 0), updateMany: jest.fn(async ({ where, data }: { where: { concursoId: string }; data: { concursoId: string } }) => { const hit = pools.filter((p) => p.concursoId === where.concursoId); hit.forEach((p) => { p.concursoId = data.concursoId; }); return { count: hit.length }; }) },
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

describe('calendário das festas', () => {
  it('Mega da Virada 2026 vem do comunicado da CAIXA: 1º/01/2027 às 10h, confirmada', () => {
    expect(proximoSorteioFesta('mega-da-virada', new Date('2026-11-03T12:00:00-03:00'))).toMatchObject({ data: '2027-01-01', hora: '10:00', confirmado: true });
  });
  it('depois que o sorteio passa, prevê a data tradicional do ano seguinte às 20h', () => {
    expect(proximoSorteioFesta('mega-da-virada', new Date('2027-01-02T12:00:00-03:00'))).toMatchObject({ data: '2027-12-31', hora: '20:00', confirmado: false });
  });
  it('previsões tradicionais: Páscoa (sábado antes), São João (sábado a partir de 24/06), Independência (sábado até 07/09)', () => {
    expect(previsaoFesta('mega-pascoa', 2027)).toBe('2027-03-27'); // Páscoa 28/03/2027
    expect(previsaoFesta('dupla-pascoa', 2026)).toBe('2026-04-04'); // Páscoa 05/04/2026
    expect(previsaoFesta('mega-sao-joao', 2027)).toBe('2027-06-26');
    expect(previsaoFesta('mega-independencia', 2026)).toBe('2026-09-05');
    expect(previsaoFesta('personalizado', 2026)).toBeNull();
  });
  it('toda festa pré-definida tem próxima data prevista', () => {
    for (const preset of FESTAS_PRESETS) expect(proximoSorteioFesta(preset.chave, new Date('2026-11-03T12:00:00-03:00'))).not.toBeNull();
  });
});

describe('festa com hora do sorteio', () => {
  const mk = () => { const db = makeDb([]); return { db, service: new LotteriesService(db as never, { get: () => undefined } as unknown as ConfigService) }; };
  const future = () => brazilDayKey(new Date(Date.now() + 60 * 86_400_000));
  it('sorteio às 10h fecha as apostas 1h antes (09h), não às 19h', async () => {
    const { service, db } = mk(); const day = future();
    await service.createFestival({ especial: 'mega-da-virada', dataSorteio: day, horaSorteio: '10:00' }, 'a1');
    expect(db.rows[0]!.dataSorteio.toISOString()).toBe(new Date(`${day}T10:00:00-03:00`).toISOString());
    expect((db.rows[0] as unknown as { cutoffAt: Date }).cutoffAt.toISOString()).toBe(new Date(`${day}T09:00:00-03:00`).toISOString());
  });
  it('sorteio às 20h mantém o corte padrão das 19h; sem hora assume 20h', async () => {
    const { service, db } = mk(); const day = future();
    await service.createFestival({ especial: 'mega-da-virada', dataSorteio: day }, 'a1');
    expect(db.rows[0]!.dataSorteio.toISOString()).toBe(new Date(`${day}T20:00:00-03:00`).toISOString());
    expect((db.rows[0] as unknown as { cutoffAt: Date }).cutoffAt.toISOString()).toBe(new Date(`${day}T19:00:00-03:00`).toISOString());
  });
  it('festivalPresets traz o próximo sorteio de cada festa', () => {
    const { service } = mk();
    const list = service.festivalPresets();
    expect(list.find((p) => p.chave === 'mega-da-virada')?.proximoSorteio).toBeTruthy();
  });
  it('quando a CAIXA oficializa, o oficial herda a hora e o corte da festa', async () => {
    const day = future();
    const provisionalRow = { id: 'p1', modalidade: 'megasena', numeroConcurso: -1, dataSorteio: new Date(`${day}T10:00:00-03:00`), cutoffAt: new Date(`${day}T09:00:00-03:00`), numeroDefinido: false, especial: 'mega-da-virada', nomeEspecial: 'Mega da Virada' } as Row;
    const real = { id: 'r1', modalidade: 'megasena', numeroConcurso: 3000, dataSorteio: new Date(`${day}T00:00:00-03:00`), numeroDefinido: true, especial: null, nomeEspecial: null } as Row;
    const db = makeDb([provisionalRow, real]);
    await adoptProvisionalContests(db as never, 'megasena', 3000, new Date(`${day}T00:00:00-03:00`));
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]!.dataSorteio.toISOString()).toBe(new Date(`${day}T10:00:00-03:00`).toISOString());
  });
});

describe('hora oficial já preenchida', () => {
  const mk = () => { const db = makeDb([]); return { db, service: new LotteriesService(db as never, { get: () => undefined } as unknown as ConfigService) }; };
  beforeAll(() => { jest.useFakeTimers({ now: new Date('2026-11-11T12:00:00-03:00') }); });
  afterAll(() => { jest.useRealTimers(); });

  it('Mega da Virada sem hora informada usa a hora oficial (10h) e fecha as apostas 1h antes', async () => {
    const { service, db } = mk();
    await service.createFestival({ especial: 'mega-da-virada', dataSorteio: '2027-01-01' }, 'a1');
    expect(db.rows[0]!.dataSorteio.toISOString()).toBe(new Date('2027-01-01T10:00:00-03:00').toISOString());
    expect((db.rows[0] as unknown as { cutoffAt: Date }).cutoffAt.toISOString()).toBe(new Date('2027-01-01T09:00:00-03:00').toISOString());
  });
  it('hora informada vale mais que a oficial', async () => {
    const { service, db } = mk();
    await service.createFestival({ especial: 'mega-da-virada', dataSorteio: '2027-01-01', horaSorteio: '11:00' }, 'a1');
    expect(db.rows[0]!.dataSorteio.toISOString()).toBe(new Date('2027-01-01T11:00:00-03:00').toISOString());
  });
  it('concurso manual no dia da Mega da Virada nasce marcado como festa, com número oficial e hora oficial', async () => {
    const { service, db } = mk();
    const out = await service.createManual({ modalidade: 'megasena', numeroConcurso: 3100, dataSorteio: '2027-01-01' } as never);
    expect(out).toMatchObject({ numeroConcurso: 3100, especial: 'mega-da-virada', nomeEspecial: 'Mega da Virada', numeroDefinido: true });
    expect(db.rows[0]!.dataSorteio.toISOString()).toBe(new Date('2027-01-01T10:00:00-03:00').toISOString());
    expect((db.rows[0] as unknown as { cutoffAt: Date }).cutoffAt.toISOString()).toBe(new Date('2027-01-01T09:00:00-03:00').toISOString());
  });
  it('concurso manual em dia comum continua às 20h e sem marca de festa', async () => {
    const { service, db } = mk();
    await service.createManual({ modalidade: 'quina', numeroConcurso: 7001, dataSorteio: '2026-12-02' } as never);
    expect(db.rows[0]!.dataSorteio.toISOString()).toBe(new Date('2026-12-02T20:00:00-03:00').toISOString());
    expect(db.rows[0]!.especial ?? null).toBeNull();
  });
});

describe('concurso manual: número que já existe', () => {
  const mk = (rows: Row[]) => { const db = makeDb(rows); return { db, service: new LotteriesService(db as never, { get: () => undefined } as unknown as ConfigService) }; };
  beforeAll(() => { jest.useFakeTimers({ now: new Date('2026-11-11T12:00:00-03:00') }); });
  afterAll(() => { jest.useRealTimers(); });
  const base = { modalidade: 'megasena', numeroDefinido: true, especial: null, nomeEspecial: null };

  it('número que era só previsão do calendário vira o concurso cadastrado, com a data e a hora informadas', async () => {
    const { service, db } = mk([{ id: 'p', numeroConcurso: 3100, dataSorteio: new Date('2026-12-02T20:00:00-03:00'), status: 'aberto', fonteSincronizacao: 'projetado', ...base } as Row]);
    const out = await service.createManual({ modalidade: 'megasena', numeroConcurso: 3100, dataSorteio: '2027-01-01' } as never);
    expect(out.id).toBe('p');
    expect(db.rows).toHaveLength(1);
    expect(db.rows[0]!.dataSorteio.toISOString()).toBe(new Date('2027-01-01T10:00:00-03:00').toISOString());
    expect(db.rows[0]).toMatchObject({ fonteSincronizacao: 'manual', especial: 'mega-da-virada' });
  });
  it('concurso real já cadastrado: o erro diz qual é e se ainda está vendendo', async () => {
    const { service } = mk([{ id: 'r', numeroConcurso: 3100, dataSorteio: new Date('2027-01-01T10:00:00-03:00'), status: 'aberto', fonteSincronizacao: 'manual', cutoffAt: new Date('2027-01-01T09:00:00-03:00'), ...base } as Row]);
    const error = await service.createManual({ modalidade: 'megasena', numeroConcurso: 3100, dataSorteio: '2027-01-02' } as never).catch((failure) => failure);
    expect(error.getStatus()).toBe(409);
    expect(error.getResponse().existente).toMatchObject({ id: 'r', numeroConcurso: 3100, vendaAberta: true });
  });
  it('festa que já existe no dia: o erro traz o concurso para a tela selecionar', async () => {
    const { service } = mk([{ id: 'f', numeroConcurso: -20270101, dataSorteio: new Date('2027-01-01T10:00:00-03:00'), status: 'aberto', cutoffAt: new Date('2027-01-01T09:00:00-03:00'), modalidade: 'megasena', numeroDefinido: false, especial: 'mega-da-virada', nomeEspecial: 'Mega da Virada' } as Row]);
    const error = await service.createFestival({ especial: 'mega-da-virada', dataSorteio: '2027-01-01' }, 'a').catch((failure) => failure);
    expect(error.getResponse()).toMatchObject({ existente: { id: 'f', nomeEspecial: 'Mega da Virada', vendaAberta: true } });
  });
});

describe('festa com número de concurso já sorteado', () => {
  const base = { modalidade: 'megasena', numeroDefinido: true };
  const drawn = (n: number): Row => ({ id: `d${n}`, numeroConcurso: n, dataSorteio: new Date('2026-11-07T20:00:00-03:00'), especial: null, nomeEspecial: null, status: 'apurado', ...base } as Row);

  beforeEach(() => { jest.useFakeTimers({ now: new Date('2026-11-11T12:00:00-03:00') }); });
  afterEach(() => jest.useRealTimers());

  it('cadastro manual com número que já foi sorteado é recusado, dizendo o último', async () => {
    const db = makeDb([drawn(3010)]);
    const service = new LotteriesService(db as never, { get: () => undefined } as never, undefined);
    await expect(service.createManual({ modalidade: 'megasena', numeroConcurso: 3005, dataSorteio: '2026-12-20' } as never)).rejects.toThrow(/já foi sorteado.*3010/);
  });

  it('festa com número já sorteado é recusada; sem número (a definir) continua valendo', async () => {
    const db = makeDb([drawn(3010)]);
    const service = new LotteriesService(db as never, { get: () => undefined } as never, undefined);
    await expect(service.createFestival({ especial: 'mega-da-virada', dataSorteio: '2027-01-01', numeroConcurso: 3010 } as never, 'a1')).rejects.toThrow(/já foi sorteado/);
    await expect(service.createFestival({ especial: 'mega-da-virada', dataSorteio: '2027-01-01' } as never, 'a1')).resolves.toMatchObject({ numeroDefinido: false });
  });

  it('informar depois o número da festa também recusa número já sorteado', async () => {
    const db = makeDb([drawn(3010), provisional({ id: 'f1', dataSorteio: new Date('2027-01-01T10:00:00-03:00'), status: 'aberto' } as never)]);
    const service = new LotteriesService(db as never, { get: () => undefined } as never, undefined);
    await expect(service.updateFestival('f1', { numeroConcurso: 3010 } as never, 'a1')).rejects.toThrow(/já foi sorteado/);
    await expect(service.updateFestival('f1', { numeroConcurso: 3012 } as never, 'a1')).resolves.toMatchObject({ numeroConcurso: 3012 });
  });
});

describe('festa que foi apurada por engano', () => {
  beforeEach(() => { jest.useFakeTimers({ now: new Date('2026-11-11T12:00:00-03:00') }); });
  afterEach(() => jest.useRealTimers());
  const broken = (extra: Record<string, unknown> = {}) => ({ id: 'f1', modalidade: 'megasena', numeroConcurso: 3011, numeroDefinido: true, especial: 'mega-da-virada', nomeEspecial: 'Mega da Virada', dataSorteio: new Date('2027-01-01T10:00:00-03:00'), cutoffAt: new Date('2026-12-31T19:00:00-03:00'), status: 'apurado', valorEstimadoPremio: 0, acumulado: false, fonteSincronizacao: 'caixa', _count: { boloes: 0 }, ...extra });
  const dbWith = (rows: any[]) => {
    const resultado = { deleteMany: jest.fn(async () => ({})) };
    const db: any = {
      concurso: { findMany: jest.fn(async () => rows.filter((r) => r.status === 'apurado')), findUnique: jest.fn(async () => null), update: jest.fn(async ({ where, data }: any) => Object.assign(rows.find((r) => r.id === where.id), data)), findFirst: jest.fn(async () => null) },
      resultado, configLoteria: { findUnique: jest.fn(async () => ({ horarioCorteLocal: '19:00' })) },
      $transaction: async (cb: (t: unknown) => Promise<unknown>) => cb(db),
    };
    return { db, resultado };
  };

  it('volta a ficar aberta, com número provisório, sem o resultado do sorteio antigo', async () => {
    const rows = [broken()];
    const { db, resultado } = dbWith(rows);
    expect(await healBrokenFestivals(db)).toBe(1);
    expect(resultado.deleteMany).toHaveBeenCalledWith({ where: { concursoId: 'f1' } });
    expect(rows[0]).toMatchObject({ status: 'aberto', numeroConcurso: -20270101, numeroDefinido: false, valorEstimadoPremio: null, fonteSincronizacao: 'manual' });
  });

  it('com bolão, só reabre (número e bolões ficam como estão)', async () => {
    const rows = [broken({ _count: { boloes: 2 } })];
    const { db, resultado } = dbWith(rows);
    await healBrokenFestivals(db);
    expect(resultado.deleteMany).not.toHaveBeenCalled();
    expect(rows[0]).toMatchObject({ status: 'aberto', numeroConcurso: 3011, numeroDefinido: true });
  });

  it('sem festa quebrada, não mexe em nada', async () => {
    const { db } = dbWith([]);
    expect(await healBrokenFestivals(db)).toBe(0);
    expect(db.concurso.update).not.toHaveBeenCalled();
  });
});
