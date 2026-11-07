import { ConflictException, ForbiddenException } from '@nestjs/common';
import { LEGAL_VERSION } from '../legal/documents';
import { PoolsService } from './pools.service';

const savedEnv = { ...process.env };
beforeAll(() => {
  process.env.PAYMENTS_ENABLED = 'true';
  Object.assign(process.env, { LEGAL_APPROVED_VERSION: LEGAL_VERSION, LEGAL_OPERATOR_NAME: 'Fixture', LEGAL_OPERATOR_CNPJ: '00000000000100', LEGAL_OPERATOR_ADDRESS: 'Fixture', LEGAL_CONTACT_EMAIL: 'test@example.invalid', LEGAL_REFUND_TERMS: 'Fixture', LEGAL_AFFILIATE_PAYOUT_TERMS: 'Fixture' });
});
afterAll(() => { process.env = savedEnv; });

const admin = { id: 'admin-1', papel: 'admin' } as any;
const affiliate = { id: 'u-aff', papel: 'afiliado' } as any;
const future = new Date(Date.now() + 86_400_000);

function createSetup() {
  const created: any[] = [];
  const tx: any = { bolao: { create: jest.fn(async ({ data }: any) => { created.push(data); return { id: 'pool-1', ...data }; }) }, jogoBolao: { createMany: jest.fn() }, grupo: { update: jest.fn() } };
  const prisma: any = {
    concurso: { findUnique: jest.fn(async () => ({ id: 'c1', cutoffAt: future, modalidade: 'megasena', config: { taxaAdministracaoTetoPct: 35, minCotasBolao: 2, maxCotasBolao: 500 } })) },
    afiliado: { findUnique: jest.fn(async () => ({ id: 'aff-1', statusAprovacao: 'aprovado', comissaoPadraoPct: { toFixed: () => '10.00' } })) },
    aceiteLegal: { findUnique: jest.fn(async () => ({ id: 'ok' })) },
    grupo: { findFirst: jest.fn(async () => ({ id: 'g1' })), findUnique: jest.fn(async () => ({ capacidadeExtra: 0 })) },
    grupoMembro: { count: jest.fn(async () => 100) },
    $transaction: async (cb: any) => cb(tx),
  };
  const service = new PoolsService(prisma, { record: jest.fn() } as any);
  (service as any).getPublicById = jest.fn(async (id: string) => ({ id }));
  return { service, created, tx };
}
const pending = (extra: Record<string, unknown> = {}) => ({ concursoId: 'c1', grupoId: 'g1', numerosApostados: [], totalCotas: 100, valorCota: 20, taxaAdministracaoPct: 0, modeloOperacional: 'mandato', precoLivre: true, numerosADefinir: true, custoRegistroCentavos: 6000, taxaPorCotaCentavos: 200, ...extra });

describe('Bolão de data festiva com números a definir', () => {
  it('cria sem jogos, com o custo estimado do registro guardado no orçamento', async () => {
    const { service, created, tx } = createSetup();
    await service.create(pending() as any, admin);
    expect(created[0].numerosApostados).toEqual([]);
    expect(created[0].precificacao).toMatchObject({ modo: 'livre', numerosADefinir: true, costCents: 6000, feePerShare: 200 });
    expect(tx.jogoBolao.createMany).not.toHaveBeenCalled();
  });
  it('só o administrador, só com preço livre e com custo estimado', async () => {
    const { service } = createSetup();
    await expect(service.create(pending() as any, affiliate)).rejects.toThrow(ForbiddenException);
    await expect(service.create(pending({ precoLivre: false }) as any, admin)).rejects.toThrow(/valor livre/);
    await expect(service.create(pending({ custoRegistroCentavos: undefined }) as any, admin)).rejects.toThrow(/custo estimado/);
    await expect(service.create(pending({ jogos: [{ ordem: 1, numeros: [1, 2, 3, 4, 5, 6] }] }) as any, admin)).rejects.toThrow(/Defina os números depois/);
  });
});

function defineSetup(poolOverrides: object = {}, buyers: Array<{ compradorId: string }> = []) {
  const pool = { id: 'p1', status: 'aberto', numerosApostados: [], jogos: [], precificacao: { costCents: 600 }, concurso: { modalidade: 'megasena', cutoffAt: future, resultado: null }, ...poolOverrides };
  const tx: any = {
    $queryRaw: jest.fn(),
    bolao: { findUniqueOrThrow: jest.fn(async () => pool), update: jest.fn() },
    jogoBolao: { count: jest.fn(async () => 0), createMany: jest.fn() },
    cota: { findMany: jest.fn(async () => buyers) },
    notificacao: { createMany: jest.fn() },
  };
  const prisma: any = { bolao: { findUnique: jest.fn(async () => pool) }, $transaction: (fn: any) => fn(tx) };
  const pricing: any = { priceGames: jest.fn(async (_m: string, games: any[]) => ({ jogos: games.map((g, i) => ({ ordem: i + 1, numeros: g.numeros, quantidadeDezenas: g.numeros.length, custoCentavos: 600 })), custoTotalCentavos: games.length * 600 })) };
  const audit: any = { record: jest.fn() };
  const service = new PoolsService(prisma, audit, undefined, pricing);
  (service as any).getPublicById = jest.fn(async (id: string) => ({ id }));
  return { service, tx, pricing };
}
const game = (n = 1) => ({ ordem: n, numeros: [n, 11, 22, 33, 44, 55] });

describe('Definir os números depois', () => {
  it('grava os jogos com o custo da tabela e avisa quem já comprou', async () => {
    const { service, tx } = defineSetup({}, [{ compradorId: 'u1' }, { compradorId: 'u2' }]);
    const result = await service.defineNumbers('p1', { jogos: [game(1)] } as any, admin);
    expect(tx.jogoBolao.createMany.mock.calls[0][0].data[0]).toMatchObject({ bolaoId: 'p1', ordem: 1, numeros: [1, 11, 22, 33, 44, 55] });
    expect(tx.bolao.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ numerosApostados: [1, 11, 22, 33, 44, 55] }) }));
    expect(tx.notificacao.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(result.aviso).toBeNull();
  });
  it('avisa quando o registro custa mais que o previsto na cota', async () => {
    const { service } = defineSetup();
    const result = await service.defineNumbers('p1', { jogos: [game(1), game(2)] } as any, admin);
    expect(result.aviso).toMatch(/acima dos R\$ 6,00/);
  });
  it('recusa números fora da regra da Mega-Sena', async () => {
    const { service, tx } = defineSetup();
    await expect(service.defineNumbers('p1', { jogos: [{ ordem: 1, numeros: [1, 2, 3, 4, 5, 61] }] } as any, admin)).rejects.toThrow(/Jogo 1/);
    expect(tx.jogoBolao.createMany).not.toHaveBeenCalled();
  });
  it('não troca números que já existem, nem depois do fechamento, nem por afiliado', async () => {
    await expect(defineSetup({ jogos: [{ id: 'g' }] }).service.defineNumbers('p1', { jogos: [game()] } as any, admin)).rejects.toThrow(/já foram definidos/);
    await expect(defineSetup({ concurso: { modalidade: 'megasena', cutoffAt: new Date(Date.now() - 1000), resultado: null } }).service.defineNumbers('p1', { jogos: [game()] } as any, admin)).rejects.toThrow(ConflictException);
    await expect(defineSetup({ status: 'cancelado' }).service.defineNumbers('p1', { jogos: [game()] } as any, admin)).rejects.toThrow(ConflictException);
    await expect(defineSetup().service.defineNumbers('p1', { jogos: [game()] } as any, affiliate)).rejects.toThrow(ForbiddenException);
  });
});
