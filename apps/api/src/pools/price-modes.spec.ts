import { ConflictException } from '@nestjs/common';
import { LEGAL_VERSION } from '../legal/documents';
import { perQuotaPctQuota, plannedKey, splitPoolByTotalPct, totalPctQuota } from '../pricing/pricing.engine';
import { PoolsService } from './pools.service';

const savedEnv = { ...process.env };
beforeAll(() => {
  process.env.PAYMENTS_ENABLED = 'true';
  Object.assign(process.env, { LEGAL_APPROVED_VERSION: LEGAL_VERSION, LEGAL_OPERATOR_NAME: 'Fixture', LEGAL_OPERATOR_CNPJ: '00000000000100', LEGAL_OPERATOR_ADDRESS: 'Fixture', LEGAL_CONTACT_EMAIL: 'test@example.invalid', LEGAL_REFUND_TERMS: 'Fixture', LEGAL_AFFILIATE_PAYOUT_TERMS: 'Fixture' });
});
afterAll(() => { process.env = savedEnv; });

const admin = { id: 'admin-1', papel: 'admin' } as any;
const affiliate = { id: 'u-aff', papel: 'afiliado' } as any;

describe('modos de preço da cota', () => {
  it('novo: % sobre o total do registro, depois dividido pelas cotas (R$ 504 + 10% em 10 cotas = R$ 55,44)', () => {
    expect(totalPctQuota(50400, 10, 1000)).toBe(5544);
    const split = splitPoolByTotalPct(50400, 10, 1000);
    expect(split).toMatchObject({ quotaCents: 5544, totalCents: 55440, ticketPerShare: 5040, feePerShare: 504, adminTotalCents: 5040 });
  });
  it('arredonda a cota para cima e o total nunca fica abaixo do registro mais a porcentagem', () => {
    for (const [cost, shares, bps] of [[50400, 7, 1000], [50400, 13, 1250], [1000, 3, 0], [999, 7, 3333]] as const) {
      const quota = totalPctQuota(cost, shares, bps);
      expect(quota * shares).toBeGreaterThanOrEqual(cost + Math.round(cost * bps / 10000));
      expect(quota * shares - (cost + Math.round(cost * bps / 10000))).toBeLessThan(shares);
    }
  });
  it('existente: registro ÷ cotas e a % em cima de cada cota (R$ 50,40 + 10% = R$ 55,44)', () => {
    expect(perQuotaPctQuota(50400, 10, 1000)).toBe(5544);
    expect(perQuotaPctQuota(50400, 7, 1000)).toBe(7200 + 720);
  });
  it('recusa porcentagem fora de 0 a 100 e cotas inválidas', () => {
    expect(() => totalPctQuota(50400, 10, 10001)).toThrow(/porcentagem/);
    expect(() => totalPctQuota(50400, 0, 100)).toThrow();
    expect(() => perQuotaPctQuota(0, 10, 100)).toThrow();
  });
  it('só a quantidade de números: Mega de 6 a 20; Lotofácil de 15 a 20', () => {
    expect(plannedKey('megasena', 9)).toBe('9');
    expect(() => plannedKey('megasena', 5)).toThrow(/6 a 20/);
    expect(() => plannedKey('lotofacil', 21)).toThrow(/15 a 20/);
    expect(() => plannedKey('supersete', 7)).toThrow();
  });
});

function setup(teto = 35) {
  const created: any[] = [];
  const tx: any = { bolao: { create: jest.fn(async ({ data }: any) => { created.push(data); return { id: 'pool-1', ...data }; }) }, jogoBolao: { createMany: jest.fn() }, grupo: { update: jest.fn() } };
  const prisma: any = {
    afiliado: { findUnique: jest.fn(async () => ({ id: 'aff-1', statusAprovacao: 'aprovado', comissaoPadraoPct: { toFixed: () => '10.00' } })) },
    aceiteLegal: { findUnique: jest.fn(async () => ({ id: 'ok' })) },
    concurso: { findUnique: jest.fn(async () => ({ id: 'c1', cutoffAt: new Date(Date.now() + 86_400_000), modalidade: 'megasena', config: { taxaAdministracaoTetoPct: teto, minCotasBolao: 2, maxCotasBolao: 500 } })) },
    grupo: { findFirst: jest.fn(async () => ({ id: 'g1', afiliadoId: 'aff-1' })), findUnique: jest.fn(async () => ({ capacidadeExtra: 0 })) },
    grupoMembro: { count: jest.fn(async () => 100) },
    $transaction: async (cb: any) => cb(tx),
  };
  const pricing: any = {
    priceByDezenas: jest.fn(async (_m: string, dezenas: number, jogos: number) => { const unit = dezenas === 9 ? 50400 : 600; return { modalidade: 'megasena', dezenas, jogos, custoPorJogoCentavos: unit, custoTotalCentavos: unit * jogos, fonte: 'x' }; }),
    priceGames: jest.fn(async (_m: string, games: any[]) => ({ jogos: games.map((g, i) => ({ ordem: i + 1, numeros: g.numeros, quantidadeDezenas: g.numeros.length, custoCentavos: 600 })), custoTotalCentavos: games.length * 600 })),
  };
  const service = new PoolsService(prisma, { record: jest.fn() } as any, undefined, pricing);
  (service as any).getPublicById = jest.fn(async (id: string) => ({ id }));
  return { service, created, tx, pricing };
}
const mega9 = (extra: Record<string, unknown> = {}) => ({ concursoId: 'c1', grupoId: 'g1', numerosApostados: [], totalCotas: 10, valorCota: 55.44, taxaAdministracaoPct: 0, modeloOperacional: 'mandato', numerosADefinir: true, dezenasPrevistas: 9, jogosPrevistos: 1, ...extra }) as any;

describe('bolão sem números, só com a quantidade de números (administrador)', () => {
  it('Mega de 9 números custa R$ 504 e a cota sai de 10% sobre o total', async () => {
    const { service, created, tx } = setup();
    await service.create(mega9({ precoLivre: true, modoPreco: 'total', precoPct: 10, taxaPorCotaCentavos: 504 }), admin);
    expect(created[0].precificacao).toMatchObject({ modo: 'livre', modoPreco: 'total', precoPct: 10, numerosADefinir: true, dezenasPrevistas: 9, jogosPrevistos: 1, costCents: 50400, quotaCents: 5544, totalCents: 55440 });
    expect(created[0].vendaAntecipada).toBe(true);
    expect(created[0].numerosApostados).toEqual([]);
    expect(tx.jogoBolao.createMany).not.toHaveBeenCalled();
  });
  it('recusa quando o valor enviado não bate com o modo escolhido', async () => {
    const { service } = setup();
    await expect(service.create(mega9({ precoLivre: true, modoPreco: 'total', precoPct: 10, valorCota: 56, taxaPorCotaCentavos: 560 }), admin)).rejects.toThrow(/mudou/);
    await expect(service.create(mega9({ precoLivre: true, modoPreco: 'total', taxaPorCotaCentavos: 504 }), admin)).rejects.toThrow(/porcentagem/);
  });
  it('modo por cota: R$ 50,40 por cota e 10% em cima de cada uma', async () => {
    const { service, created } = setup();
    await service.create(mega9({ precoLivre: true, modoPreco: 'por_cota', precoPct: 10, taxaPorCotaCentavos: 504 }), admin);
    expect(created[0].precificacao).toMatchObject({ modoPreco: 'por_cota', precoPct: 10, quotaCents: 5544, ticketPerShare: 5040, feePerShare: 504 });
  });
  it('quantidade de números e de jogos andam juntas e só valem sem números', async () => {
    const { service } = setup();
    await expect(service.create(mega9({ precoLivre: true, jogosPrevistos: undefined }), admin)).rejects.toThrow(/quantidade de números e a quantidade de jogos/);
    await expect(service.create(mega9({ precoLivre: true, numerosADefinir: false }), admin)).rejects.toThrow(/só vale para bolão com números a definir/);
  });
});

describe('modos de preço do afiliado', () => {
  it('sem números: custo da tabela, 10% sobre o total, cota R$ 55,44', async () => {
    const { service, created } = setup();
    await service.create(mega9({ modoPreco: 'total', taxaAdministracaoPct: 10 }), affiliate);
    expect(created[0].precificacao).toMatchObject({ modoPreco: 'total', precoPct: 10, costCents: 50400, quotaCents: 5544, numerosADefinir: true, dezenasPrevistas: 9 });
    expect(Number(created[0].valorCota)).toBeCloseTo(55.44, 2);
  });
  it('não passa do teto de taxa nem com cota digitada', async () => {
    const { service } = setup(20);
    await expect(service.create(mega9({ modoPreco: 'total', taxaAdministracaoPct: 25 }), affiliate)).rejects.toThrow(/acima do teto/);
    await expect(service.create(mega9({ modoPreco: 'manual', valorCota: 70 }), affiliate)).rejects.toThrow(/acima do teto/);
    const { service: ok, created } = setup(20);
    await ok.create(mega9({ modoPreco: 'manual', valorCota: 60 }), affiliate);
    expect(created[0].precificacao).toMatchObject({ modoPreco: 'manual', quotaCents: 6000, costCents: 50400 });
  });
  it('cota digitada precisa cobrir o registro de cada cota', async () => {
    const { service } = setup();
    await expect(service.create(mega9({ modoPreco: 'manual', valorCota: 40 }), affiliate)).rejects.toThrow(/não cobre/);
  });
  it('sem números exige quantidade de números e jogos; não existe valor livre para afiliado', async () => {
    const { service } = setup();
    await expect(service.create(mega9({ modoPreco: 'total', taxaAdministracaoPct: 10, dezenasPrevistas: undefined, jogosPrevistos: undefined }), affiliate)).rejects.toThrow(/quantidade de números e de jogos/);
    await expect(service.create(mega9({ precoLivre: true, modoPreco: 'total', precoPct: 10 }), affiliate)).rejects.toThrow(/administrador/);
  });
  it('com jogos digitados: custo pela tabela e modo total', async () => {
    const { service, created } = setup();
    const jogos = [1, 2].map((i) => ({ ordem: i, numeros: [i, 11, 22, 33, 44, 55] }));
    await service.create({ concursoId: 'c1', grupoId: 'g1', numerosApostados: jogos[0]!.numeros, jogos, totalCotas: 10, valorCota: 1, taxaAdministracaoPct: 10, modeloOperacional: 'mandato', precificacaoAutomatica: true, modoPreco: 'total' } as any, affiliate);
    expect(created[0].precificacao).toMatchObject({ modoPreco: 'total', costCents: 1200, quotaCents: 132 });
  });
  it('sem modo, o caminho antigo continua igual', async () => {
    const { service, pricing } = setup();
    (service as any).quote = jest.fn(async () => ({ quotaCents: 100, totalCents: 1000, jogos: [{ ordem: 1, numeros: [1, 2, 3, 4, 5, 6], quantidadeDezenas: 6, custo: 6 }] }));
    await expect(service.create({ concursoId: 'c1', grupoId: 'g1', numerosApostados: [1, 2, 3, 4, 5, 6], totalCotas: 10, valorCota: 1, taxaAdministracaoPct: 10, modeloOperacional: 'mandato', precificacaoAutomatica: true } as any, affiliate)).resolves.toBeDefined();
    expect(pricing.priceByDezenas).not.toHaveBeenCalled();
  });
});

describe('definir os números depois', () => {
  function defineSetup(snapshot: object, papel: 'admin' | 'afiliado', games: number) {
    const future = new Date(Date.now() + 86_400_000);
    const pool = { id: 'p1', status: 'aberto', criadoPor: 'u-aff', numerosApostados: [], jogos: [], precificacao: snapshot, concurso: { modalidade: 'megasena', cutoffAt: future, resultado: null } };
    const tx: any = { $queryRaw: jest.fn(), bolao: { findUniqueOrThrow: jest.fn(async () => pool), update: jest.fn() }, jogoBolao: { count: jest.fn(async () => 0), createMany: jest.fn() }, cota: { findMany: jest.fn(async () => []) }, notificacao: { createMany: jest.fn() } };
    const prisma: any = { bolao: { findUnique: jest.fn(async () => pool) }, afiliado: { findUnique: jest.fn(async () => ({ statusAprovacao: 'aprovado', comissaoPadraoPct: { toFixed: () => '10.00' } })) }, aceiteLegal: { findUnique: jest.fn(async () => ({ id: 'ok' })) }, $transaction: (fn: any) => fn(tx) };
    const pricing: any = { priceGames: jest.fn(async (_m: string, g: any[]) => ({ jogos: g.map((x, i) => ({ ordem: i + 1, numeros: x.numeros, quantidadeDezenas: x.numeros.length, custoCentavos: x.numeros.length === 9 ? 50400 : 600 })), custoTotalCentavos: g.reduce((s, x) => s + (x.numeros.length === 9 ? 50400 : 600), 0) })) };
    const service = new PoolsService(prisma, { record: jest.fn() } as any, undefined, pricing);
    (service as any).getPublicById = jest.fn(async (id: string) => ({ id }));
    const dto = { jogos: Array.from({ length: games }, (_, i) => ({ ordem: i + 1, numeros: papel === 'afiliado' && games === 1 && i === 0 ? [1, 2, 3, 4, 5, 6, 7, 8, 9] : [1 + i, 2, 3, 4, 5, 6, 7, 8, 9] })) } as any;
    return { service, dto, user: { id: 'u-aff', papel } as any };
  }
  it('afiliado define os números do próprio bolão quando bate com o previsto', async () => {
    const { service, dto, user } = defineSetup({ costCents: 50400, dezenasPrevistas: 9, jogosPrevistos: 1 }, 'afiliado', 1);
    await expect(service.defineNumbers('p1', dto, user)).resolves.toBeDefined();
  });
  it('afiliado não passa do custo previsto nem muda a quantidade de jogos', async () => {
    const { service, dto, user } = defineSetup({ costCents: 50400, dezenasPrevistas: 9, jogosPrevistos: 1 }, 'afiliado', 2);
    await expect(service.defineNumbers('p1', dto, user)).rejects.toThrow(ConflictException);
  });
  it('administrador recebe só o aviso quando a quantidade difere', async () => {
    const { service, dto, user } = defineSetup({ costCents: 100800, dezenasPrevistas: 9, jogosPrevistos: 3 }, 'admin', 2);
    const result: any = await service.defineNumbers('p1', dto, user);
    expect(result.aviso).toMatch(/previstos 3 jogos de 9 números e você informou 2/);
  });
  it('outro afiliado não mexe no bolão alheio', async () => {
    const { service, dto } = defineSetup({ costCents: 50400 }, 'afiliado', 1);
    await expect(service.defineNumbers('p1', dto, { id: 'outro', papel: 'afiliado' } as any)).rejects.toThrow(/seus próprios/);
  });
});
