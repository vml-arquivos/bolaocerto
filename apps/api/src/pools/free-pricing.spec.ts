import { ConflictException, ForbiddenException } from '@nestjs/common';
import { LEGAL_VERSION } from '../legal/documents';
import { splitPoolByFee, splitPoolByQuota } from '../pricing/pricing.engine';
import { computeShareAmounts } from '../payments/payments.service';
import { PoolsService } from './pools.service';

const savedEnv = { ...process.env };
beforeAll(() => {
  process.env.PAYMENTS_ENABLED = 'true';
  Object.assign(process.env, { LEGAL_APPROVED_VERSION: LEGAL_VERSION, LEGAL_OPERATOR_NAME: 'Fixture', LEGAL_OPERATOR_CNPJ: '00000000000100', LEGAL_OPERATOR_ADDRESS: 'Fixture', LEGAL_CONTACT_EMAIL: 'test@example.invalid', LEGAL_REFUND_TERMS: 'Fixture', LEGAL_AFFILIATE_PAYOUT_TERMS: 'Fixture' });
});
afterAll(() => { process.env = savedEnv; });

const admin = { id: 'admin-1', papel: 'admin' } as any;
const affiliate = { id: 'u-aff', papel: 'afiliado' } as any;

describe('splitPoolByQuota (preço livre)', () => {
  it('registro de R$ 60 em 100 cotas custa R$ 0,60 por cota; a cota de R$ 20 deixa R$ 19,40 de serviço', () => {
    const split = splitPoolByQuota(6000, 100, 2000);
    expect(split).toMatchObject({ ticketPerShare: 60, feePerShare: 1940, quotaCents: 2000, adminTotalCents: 194000, totalCents: 200000, roundingReserveCents: 0 });
  });

  it('arredonda o registro por cota para cima e mostra a reserva', () => {
    const split = splitPoolByQuota(6300, 70, 1000);
    expect(split.ticketPerShare).toBe(90);
    expect(split.roundingReserveCents).toBe(0);
    const odd = splitPoolByQuota(1000, 3, 500);
    expect(odd.ticketPerShare).toBe(334);
    expect(odd.roundingReserveCents).toBe(2);
    expect(odd.ticketBudgetCents + odd.adminTotalCents).toBe(odd.totalCents);
  });

  it('não aceita cota menor que a parte do registro, mas aceita taxa zero', () => {
    expect(() => splitPoolByQuota(6000, 100, 59)).toThrow(/não cobre/);
    expect(splitPoolByQuota(6000, 100, 60).feePerShare).toBe(0);
  });

  it('a soma do registro com o serviço sempre fecha com o valor pago', () => {
    for (const [cost, shares, quota] of [[6000, 100, 2000], [12345, 7, 5000], [0, 10, 100], [999, 3, 1000]] as const) {
      const split = splitPoolByQuota(cost, shares, quota);
      expect(split.ticketPerShare + split.feePerShare).toBe(quota);
      expect(split.ticketBudgetCents + split.adminTotalCents).toBe(quota * shares);
    }
  });
});

function setup() {
  const created: any[] = [];
  const tx: any = { bolao: { create: jest.fn(async ({ data }: any) => { created.push(data); return { id: 'pool-1', ...data }; }) }, jogoBolao: { createMany: jest.fn() }, grupo: { update: jest.fn() } };
  const prisma: any = {
    afiliado: { findUnique: jest.fn(async () => ({ id: 'aff-1', statusAprovacao: 'aprovado', comissaoPadraoPct: { toFixed: () => '10.00' } })) },
    aceiteLegal: { findUnique: jest.fn(async () => ({ id: 'ok' })) },
    concurso: { findUnique: jest.fn(async () => ({ id: 'c1', cutoffAt: new Date(Date.now() + 86_400_000), modalidade: 'megasena', config: { taxaAdministracaoTetoPct: 35, minCotasBolao: 2, maxCotasBolao: 500 } })) },
    grupo: { findFirst: jest.fn(async () => ({ id: 'g1', afiliadoId: 'aff-1' })), findUnique: jest.fn(async () => ({ capacidadeExtra: 0 })) },
    grupoMembro: { count: jest.fn(async () => 100) },
    $transaction: async (cb: any) => cb(tx),
  };
  const pricing: any = { priceGames: jest.fn(async (_m: string, games: any[]) => ({ jogos: games.map((game, i) => ({ ordem: i + 1, numeros: game.numeros, quantidadeDezenas: game.numeros.length, custoCentavos: 600 * (game.numeros.length === 6 ? 1 : 7) })), custoTotalCentavos: games.reduce((s: number, g: any) => s + 600 * (g.numeros.length === 6 ? 1 : 7), 0) })) };
  const service = new PoolsService(prisma, { record: jest.fn() } as any, undefined, pricing);
  (service as any).getPublicById = jest.fn(async (id: string) => ({ id }));
  return { service, created, pricing };
}
const sixGames = (n: number) => Array.from({ length: n }, (_, i) => ({ ordem: i + 1, numeros: [1 + i, 11, 22, 33, 44, 55] }));
const base = (extra: Record<string, unknown> = {}) => ({ concursoId: 'c1', grupoId: 'g1', numerosApostados: [1, 11, 22, 33, 44, 55], jogos: sixGames(10), totalCotas: 100, valorCota: 20, taxaAdministracaoPct: 97, modeloOperacional: 'mandato', precoLivre: true, precificacaoAutomatica: true, ...extra }) as any;

describe('splitPoolByFee (taxa definida)', () => {
  it('cota de R$ 20, taxa de 10% (R$ 2): R$ 18 ficam no bolão e o total é R$ 2.000', () => {
    const split = splitPoolByFee(6000, 100, 2000, 200);
    expect(split).toMatchObject({ ticketPerShare: 1800, feePerShare: 200, adminTotalCents: 20000, totalCents: 200000, ticketBudgetCents: 180000, roundingReserveCents: 174000 });
  });
  it('recusa taxa que deixa menos que o registro por cota, ou maior que a cota', () => {
    expect(() => splitPoolByFee(6000, 100, 2000, 1950)).toThrow(/Diminua a taxa/);
    expect(() => splitPoolByFee(6000, 100, 2000, 2100)).toThrow(/não pode ser maior/);
    expect(splitPoolByFee(6000, 100, 2000, 1940).ticketPerShare).toBe(60);
  });
  it('a soma do que fica no bolão com a taxa fecha com o total', () => {
    for (const [cost, shares, quota, fee] of [[6000, 100, 2000, 200], [12345, 7, 5000, 1250], [0, 10, 500, 100]] as Array<[number, number, number, number]>) {
      const split = splitPoolByFee(cost, shares, quota, fee);
      expect(split.ticketBudgetCents + split.adminTotalCents).toBe(split.totalCents);
    }
  });
});

describe('PoolsService.create com preço livre', () => {
  it('administrador define a taxa: cota de R$ 20 e taxa de R$ 2 por cota', async () => {
    const { service, created } = setup();
    await service.create(base({ taxaPorCotaCentavos: 200 }), admin);
    expect(created[0].precificacao).toMatchObject({ modo: 'livre', costCents: 6000, ticketPerShare: 1800, feePerShare: 200, totalCents: 200000 });
    expect(created[0].taxaAdministracaoPct.toString()).toBe('10');
  });

  it('recusa taxa que não deixa o registro de cada cota', async () => {
    const { service } = setup();
    await expect(service.create(base({ taxaPorCotaCentavos: 1999 }), admin)).rejects.toThrow(ConflictException);
  });

  it('administrador: cota de R$ 20 com registro de R$ 60 em 100 cotas, sem travar no teto da taxa', async () => {
    const { service, created } = setup();
    await service.create(base(), admin);
    expect(created[0].valorCota.toString()).toBe('20');
    expect(created[0].taxaAdministracaoPct.toString()).toBe('97');
    expect(created[0].precificacao).toMatchObject({ modo: 'livre', costCents: 6000, ticketPerShare: 60, feePerShare: 1940, adminTotalCents: 194000, totalCents: 200000 });
    expect(created[0].status).toBe('rascunho');
  });

  it('o pagamento usa a divisão gravada: R$ 20 pagos = R$ 0,60 de registro + R$ 19,40 de serviço', async () => {
    const { service, created } = setup();
    await service.create(base(), admin);
    const snapshot = created[0].precificacao;
    const cost = snapshot.ticketPerShare * 1 / 100;
    const fee = snapshot.feePerShare * 1 / 100;
    expect(cost + fee).toBe(20);
    expect(fee).toBe(19.4);
  });

  it('vários bolões do mesmo concurso com jogos de tamanhos diferentes', async () => {
    const { service, created } = setup();
    await service.create(base({ jogos: [{ ordem: 1, numeros: [1, 2, 3, 4, 5, 6, 7] }], numerosApostados: [1, 2, 3, 4, 5, 6, 7], totalCotas: 10, valorCota: 15 }), admin);
    expect(created[0].precificacao).toMatchObject({ costCents: 4200, ticketPerShare: 420, feePerShare: 1080 });
  });

  it('sem a tabela, usa o custo do registro informado', async () => {
    const { service, created, pricing } = setup();
    await service.create(base({ precificacaoAutomatica: false, custoRegistroCentavos: 9000, jogos: [{ ordem: 1, numeros: [1, 2, 3, 4, 5, 6], custo: 0 }] }), admin);
    expect(pricing.priceGames).not.toHaveBeenCalled();
    expect(created[0].precificacao).toMatchObject({ costCents: 9000, ticketPerShare: 90 });
  });

  it('recusa cota que não cobre o registro e preço que mudou', async () => {
    const { service } = setup();
    await expect(service.create(base({ valorCota: 0.5 }), admin)).rejects.toThrow(ConflictException);
    await expect(service.create(base({ totalCotadoCentavos: 123 }), admin)).rejects.toThrow(/O preço mudou/);
  });

  it('afiliado não usa preço livre e continua com o teto de 35%', async () => {
    const { service } = setup();
    await expect(service.create(base(), affiliate)).rejects.toThrow(ForbiddenException);
    await expect(service.create(base({ precoLivre: false, precificacaoAutomatica: false }), affiliate)).rejects.toThrow(/acima do teto/);
  });

  it('administrador fora do preço livre também continua com o teto de 35%', async () => {
    const { service } = setup();
    await expect(service.create(base({ precoLivre: false, precificacaoAutomatica: false, taxaAdministracaoPct: 40 }), admin)).rejects.toThrow(/acima do teto/);
  });

  it('modelo antigo não mudou: taxa de 25% sobre o custo', () => {
    expect(computeShareAmounts(0.75, 100, 25, 0)).toMatchObject({ gross: 75, cost: 60, adminFee: 15 });
  });
});
