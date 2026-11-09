import { ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MODALIDADES_LOTERIA } from '@bolaocerto/shared-types';
import { LotteriesService } from './lotteries.service';

const payload = (n: number) => JSON.stringify({
  numero: n, dataApuracao: '17/10/2026', numeroConcursoProximo: n + 1, dataProximoConcurso: '20/10/2026', acumulado: false,
  listaDezenas: ['01', '02', '03'], listaRateioPremio: [], valorEstimadoProximoConcurso: 1000,
});

function build(env: Record<string, string> = {}) {
  const upserts: Array<{ modalidade: string; numero: number; fonte: string }> = [];
  const tx = {
    concurso: { findMany: jest.fn(async () => []), findUnique: jest.fn(async () => null), upsert: jest.fn(async (args: { where: { modalidade_numeroConcurso: { modalidade: string; numeroConcurso: number } }; create: { fonteSincronizacao: string } }) => { upserts.push({ modalidade: args.where.modalidade_numeroConcurso.modalidade, numero: args.where.modalidade_numeroConcurso.numeroConcurso, fonte: args.create.fonteSincronizacao }); return { id: 'c1' }; }) },
    resultado: { upsert: jest.fn(async () => ({})) },
  };
  const prisma = {
    configLoteria: { findUnique: jest.fn(async () => ({ horarioCorteLocal: '19:00' })) },
    concurso: { updateMany: jest.fn(async () => ({ count: 0 })), findUnique: jest.fn(async () => null), update: jest.fn(async () => ({})), create: jest.fn(async (_args: { data: Record<string, unknown> }) => ({})) },
    $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
  };
  const config = { get: (key: string, def?: string) => env[key] ?? def } as unknown as ConfigService;
  return { service: new LotteriesService(prisma as never, config), upserts, prisma };
}

function mockFetch(handler: (url: string) => { status?: number; body?: string }) {
  return jest.spyOn(globalThis, 'fetch').mockImplementation((async (input: unknown) => {
    const { status = 200, body = '' } = handler(String(input));
    return new Response(body, { status });
  }) as never);
}

afterEach(() => jest.restoreAllMocks());

describe('LotteriesService.sync: concursos à frente', () => {
  it('grava o concurso seguinte quando a CAIXA já o publica, com a data oficial', async () => {
    mockFetch((url) => (url.endsWith('/megasena/102') ? { body: JSON.stringify({ numero: 102, dataApuracao: '27/12/2030', listaDezenas: [] }) } : { body: payload(100) }));
    const { service, prisma } = build();
    await service.sync('megasena');
    expect(prisma.concurso.create).toHaveBeenCalledTimes(1);
    expect(prisma.concurso.create.mock.calls[0]![0].data).toMatchObject({ modalidade: 'megasena', numeroConcurso: 102, status: 'aberto', fonteSincronizacao: 'caixa' });
  });
  it('ignora número que a CAIXA ainda não tem, já apurado ou que já é oficial', async () => {
    mockFetch((url) => (url.endsWith('/megasena/102') ? { status: 404, body: '{}' } : { body: payload(100) }));
    const { service, prisma } = build();
    await service.sync('megasena');
    expect(prisma.concurso.create).not.toHaveBeenCalled();
    mockFetch((url) => (url.endsWith('/megasena/102') ? { body: JSON.stringify({ numero: 102, dataApuracao: '27/12/2030', listaDezenas: ['01'] }) } : { body: payload(100) }));
    await service.sync('megasena');
    expect(prisma.concurso.create).not.toHaveBeenCalled();
  });
});

describe('LotteriesService.sync (CAIXA)', () => {
  it('sincroniza todas as modalidades e grava a fonte', async () => {
    mockFetch(() => ({ body: payload(100) }));
    const { service, upserts } = build();
    const result = await service.sync();
    expect(result.sincronizados).toBe(MODALIDADES_LOTERIA.length);
    expect(result.fontes).toEqual(['caixa']);
    expect(result.falhas).toEqual([]);
    expect(upserts.every((row) => row.fonte === 'caixa')).toBe(true);
  });

  it('uma modalidade com falha não derruba as demais', async () => {
    mockFetch((url) => (url.endsWith('/quina') ? { status: 403, body: 'Azion' } : { body: payload(100) }));
    const { service } = build();
    const result = await service.sync();
    expect(result.sincronizados).toBe(MODALIDADES_LOTERIA.length - 1);
    expect(result.falhas).toHaveLength(1);
    expect(result.falhas[0]?.modalidade).toBe('quina');
    expect(result.falhas[0]?.erro).toMatch(/HTTP 403/);
  });

  it('usa a fonte alternativa e registra "fallback" quando a CAIXA bloqueia', async () => {
    mockFetch((url) => (url.includes('caixa.gov.br') ? { status: 403, body: 'Azion' } : { body: JSON.stringify({ concurso: 55, data: '17/10/2026', dezenas: ['01'], proximoConcurso: 56, dataProximoConcurso: '20/10/2026', acumulou: false, premiacoes: [] }) }));
    const { service, upserts } = build({ CAIXA_FALLBACK_BASE_URL: 'https://mirror.test/api' });
    const result = await service.sync('megasena');
    expect(result).toMatchObject({ sincronizados: 1, fontes: ['fallback'], falhas: [] });
    expect(upserts.map((row) => row.numero)).toEqual([55, 56]);
    expect(upserts.every((row) => row.fonte === 'fallback')).toBe(true);
  });

  it('falha com mensagem útil quando nada foi sincronizado', async () => {
    mockFetch(() => ({ status: 403, body: 'Azion' }));
    const { service } = build();
    await expect(service.sync('megasena')).rejects.toThrow(ServiceUnavailableException);
    await expect(service.sync('megasena')).rejects.toThrow(/Testar conexão/);
  });

  it('diagnóstico não grava nada e informa a causa por modalidade', async () => {
    mockFetch((url) => (url.endsWith('/megasena') ? { body: payload(7) } : { status: 403, body: 'Azion' }));
    const { service, prisma } = build();
    const result = await service.diagnostics();
    expect(prisma.$transaction).not.toHaveBeenCalled();
    const mega = result.resultados.find((row) => row.modalidade === 'megasena');
    expect(mega).toMatchObject({ ok: true, fonte: 'caixa', numero: 7, proximo: 8 });
    const quina = result.resultados.find((row) => row.modalidade === 'quina');
    expect(quina).toMatchObject({ ok: false });
    expect(quina?.dica).toMatch(/Azion/);
  });
});

describe('LotteriesService — concursos vencidos', () => {
  function withContestMock() {
    const updateMany = jest.fn(async () => ({ count: 3 }));
    const findMany = jest.fn(async () => []);
    const prisma = { concurso: { updateMany, findMany }, configLoteria: { findUnique: jest.fn(async () => null) } };
    const service = new LotteriesService(prisma as never, { get: () => undefined } as unknown as ConfigService);
    return { service, updateMany, findMany };
  }

  it('closeExpired fecha só abertos com prazo vencido', async () => {
    const { service, updateMany } = withContestMock();
    expect(await service.closeExpired()).toBe(3);
    const args = (updateMany.mock.calls[0] as unknown as [{ where: { status: string; cutoffAt: { lte: Date } }; data: { status: string } }])[0];
    expect(args.where.status).toBe('aberto');
    expect(args.where.cutoffAt.lte).toBeInstanceOf(Date);
    expect(args.data).toEqual({ status: 'fechado' });
  });

  it('lista pública padrão só traz abertos com prazo no futuro; histórico vem do mais recente', async () => {
    const { service, findMany } = withContestMock();
    await service.list();
    const open = (findMany.mock.calls[0] as unknown as [{ where: Record<string, unknown>; orderBy: Array<Record<string, string>> }])[0];
    expect(open.where).toMatchObject({ status: 'aberto' });
    expect((open.where.cutoffAt as { gt: Date }).gt).toBeInstanceOf(Date);
    expect(open.orderBy[0]).toEqual({ dataSorteio: 'asc' });
    await service.list(undefined, 'apurado');
    const history = (findMany.mock.calls[1] as unknown as [{ where: Record<string, unknown>; orderBy: Array<Record<string, string>> }])[0];
    expect(history.where).toEqual({ status: 'apurado' });
    expect(history.orderBy[0]).toEqual({ dataSorteio: 'desc' });
  });

  it('sincronizar fecha os vencidos mesmo quando a CAIXA falha', async () => {
    jest.spyOn(globalThis, 'fetch').mockImplementation((async () => new Response('Azion', { status: 403 })) as never);
    const { service, updateMany } = withContestMock();
    (service as unknown as { prisma: { configLoteria: { findUnique: jest.Mock } } }).prisma.configLoteria.findUnique.mockResolvedValue({ horarioCorteLocal: '19:00' });
    await expect(service.sync('megasena')).rejects.toThrow(ServiceUnavailableException);
    expect(updateMany).toHaveBeenCalled();
  });
});

describe('sync preserva hora e corte de concurso de festa', () => {
  it('se o próximo concurso é festa do mesmo dia, a CAIXA não zera a hora (10h) nem volta o corte para 19h', async () => {
    mockFetch(() => ({ body: payload(100) }));
    const festa = { id: 'f1', especial: 'mega-da-virada', dataSorteio: new Date('2026-10-20T10:00:00-03:00') };
    const upserts: Array<{ where: { modalidade_numeroConcurso: { numeroConcurso: number } }; update: Record<string, unknown> }> = [];
    const tx = {
      concurso: {
        findMany: jest.fn(async () => []),
        findUnique: jest.fn(async ({ where }: { where: { modalidade_numeroConcurso: { numeroConcurso: number } } }) => where.modalidade_numeroConcurso.numeroConcurso === 101 ? festa : null),
        upsert: jest.fn(async (args: { where: { modalidade_numeroConcurso: { numeroConcurso: number } }; update: Record<string, unknown> }) => { upserts.push(args); return { id: 'x' }; }),
      },
      resultado: { upsert: jest.fn(async () => ({})) },
    };
    const prisma = { configLoteria: { findUnique: jest.fn(async () => ({ horarioCorteLocal: '19:00' })) }, concurso: { updateMany: jest.fn(async () => ({ count: 0 })) }, $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)) };
    const service = new LotteriesService(prisma as never, { get: (_k: string, d?: string) => d } as unknown as ConfigService);
    await service.sync('megasena');
    const next = upserts.find((u) => u.where.modalidade_numeroConcurso.numeroConcurso === 101)!;
    expect(next.update).not.toHaveProperty('dataSorteio');
    expect(next.update).not.toHaveProperty('cutoffAt');
    const current = upserts.find((u) => u.where.modalidade_numeroConcurso.numeroConcurso === 100)!;
    expect(current.update).toHaveProperty('dataSorteio');
  });
});

describe('LotteriesService.sync: festa já aberta na CAIXA para data distante', () => {
  // Mega da Virada: sorteio em 01/01/2027. O próximo concurso normal da CAIXA é bem antes; o número da festa só se acha por busca.
  const FESTA_DIA = '01/01/2027';
  const nextPayload = (n: number) => JSON.stringify({ numero: n, dataApuracao: '17/10/2026', numeroConcursoProximo: n + 1, dataProximoConcurso: '20/10/2026', acumulado: false, listaDezenas: ['01'], listaRateioPremio: [], valorEstimadoProximoConcurso: 1000 });
  // Concursos 101..: datas crescentes de 3 em 3 dias a partir de 20/10/2026; o concurso 124 cai em 01/01/2027 e a CAIXA só conhece até o 130.
  const dateOf = (n: number) => { const d = new Date(Date.UTC(2026, 9, 20) + (n - 101) * 3 * 86_400_000); return `${String(d.getUTCDate()).padStart(2, '0')}/${String(d.getUTCMonth() + 1).padStart(2, '0')}/${d.getUTCFullYear()}`; };
  const caixa = (known: number, festaNumber: number) => (url: string) => {
    const match = url.match(/\/megasena\/(\d+)$/);
    if (!match) return { body: nextPayload(100) };
    const n = Number(match[1]);
    if (n > known) return { status: 404, body: '{}' };
    return { body: JSON.stringify({ numero: n, dataApuracao: n === festaNumber ? FESTA_DIA : dateOf(n), listaDezenas: [] }) };
  };
  function buildFesta(existing: Array<Record<string, unknown>> = []) {
    const writes: Array<Record<string, any>> = [];
    const tx = {
      concurso: {
        findMany: jest.fn(async () => []), findUnique: jest.fn(async () => null),
        upsert: jest.fn(async () => ({ id: 'c1' })),
        create: jest.fn(async (args: { data: Record<string, unknown> }) => { writes.push(args.data); return {}; }),
        update: jest.fn(async () => ({})),
      },
      resultado: { upsert: jest.fn(async () => ({})) },
      bolao: { updateMany: jest.fn(async () => ({ count: 0 })) },
    };
    const prisma = {
      configLoteria: { findUnique: jest.fn(async () => ({ horarioCorteLocal: '19:00' })) },
      concurso: { updateMany: jest.fn(async () => ({ count: 0 })), findUnique: jest.fn(async () => null), update: jest.fn(async () => ({})), create: jest.fn(async () => ({})), findMany: jest.fn(async () => existing) },
      $transaction: jest.fn(async (cb: (t: typeof tx) => Promise<unknown>) => cb(tx)),
    };
    const config = { get: (key: string, def?: string) => (key === 'CAIXA_CONCURSOS_A_FRENTE' ? '0' : def) } as unknown as ConfigService;
    return { service: new LotteriesService(prisma as never, config), writes, prisma, tx };
  }

  it('acha o número da Mega da Virada por busca e grava como festa oficial, com a hora das 10h', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout'], now: new Date('2026-11-09T12:00:00-03:00') });
    const spy = mockFetch(caixa(130, 124));
    const { service, writes } = buildFesta();
    await service.sync('megasena');
    jest.useRealTimers();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toMatchObject({ modalidade: 'megasena', numeroConcurso: 124, especial: 'mega-da-virada', nomeEspecial: 'Mega da Virada', numeroDefinido: true, fonteSincronizacao: 'caixa', status: 'aberto' });
    expect((writes[0]!.dataSorteio as Date).toISOString()).toBe('2027-01-01T13:00:00.000Z');
    // busca binária: bem menos consultas do que andar número por número
    const probed = new Set(spy.mock.calls.map(([url]) => String(url).match(/\/megasena\/(\d+)$/)?.[1]).filter(Boolean));
    expect(probed.size).toBeLessThan(10);
  });

  it('se a CAIXA ainda não publicou o concurso da festa, não inventa nada', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout'], now: new Date('2026-11-09T12:00:00-03:00') });
    mockFetch(caixa(110, -1));
    const { service, writes } = buildFesta();
    await service.sync('megasena');
    jest.useRealTimers();
    expect(writes).toHaveLength(0);
  });

  it('não repete a busca quando a festa já está gravada com número oficial', async () => {
    jest.useFakeTimers({ doNotFake: ['nextTick', 'setImmediate', 'setTimeout'], now: new Date('2026-11-09T12:00:00-03:00') });
    const spy = mockFetch(caixa(130, 124));
    const { service, writes } = buildFesta([{ id: 'x', numeroConcurso: 124, numeroDefinido: true, especial: 'mega-da-virada', dataSorteio: new Date('2027-01-01T13:00:00Z') }]);
    await service.sync('megasena');
    jest.useRealTimers();
    expect(writes).toHaveLength(0);
    expect(spy.mock.calls.filter(([url]) => /\/megasena\/\d+$/.test(String(url))).length).toBe(0);
  });
});
