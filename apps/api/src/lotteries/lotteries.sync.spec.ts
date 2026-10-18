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
    concurso: { upsert: jest.fn(async (args: { where: { modalidade_numeroConcurso: { modalidade: string; numeroConcurso: number } }; create: { fonteSincronizacao: string } }) => { upserts.push({ modalidade: args.where.modalidade_numeroConcurso.modalidade, numero: args.where.modalidade_numeroConcurso.numeroConcurso, fonte: args.create.fonteSincronizacao }); return { id: 'c1' }; }) },
    resultado: { upsert: jest.fn(async () => ({})) },
  };
  const prisma = {
    configLoteria: { findUnique: jest.fn(async () => ({ horarioCorteLocal: '19:00' })) },
    concurso: { updateMany: jest.fn(async () => ({ count: 0 })) },
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
