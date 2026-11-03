import { officialPriceRows } from './pricing.engine';
import { PricingService } from './pricing.service';

type Row = { id: string; modalidade: string; chave: string; valorCentavos: number; vigenteDesde: Date; vigenteAte: Date | null };

function setup(initial: Row[] = []) {
  const rows = [...initial];
  const prisma: any = {
    precoLoteria: {
      findMany: jest.fn(async ({ where, select }: any = {}) => {
        let out = rows;
        if (where?.modalidade) out = out.filter((r) => r.modalidade === where.modalidade);
        if (where?.chave?.in) out = out.filter((r) => where.chave.in.includes(r.chave));
        return select ? out.map((r) => ({ modalidade: r.modalidade, chave: r.chave })) : out;
      }),
      createMany: jest.fn(async ({ data }: any) => { for (const item of data) rows.push({ id: `p${rows.length}`, vigenteAte: null, ...item }); return { count: data.length }; }),
    },
  };
  return { service: new PricingService(prisma), prisma, rows };
}

describe('tabela de preços da CAIXA', () => {
  it('ao iniciar, carrega todos os preços oficiais quando o banco está vazio', async () => {
    const { service, rows } = setup();
    await service.onModuleInit();
    expect(rows).toHaveLength(officialPriceRows().length);
    expect(rows.find((r) => r.modalidade === 'megasena' && r.chave === '10')?.valorCentavos).toBe(126000);
  });
  it('não repete nem sobrescreve preço que já existe', async () => {
    const existing: Row = { id: 'x', modalidade: 'megasena', chave: '6', valorCentavos: 700, vigenteDesde: new Date('2026-01-01'), vigenteAte: null };
    const { service, rows } = setup([existing]);
    await service.ensureOfficialPrices();
    expect(rows.filter((r) => r.modalidade === 'megasena' && r.chave === '6')).toHaveLength(1);
    expect(rows.find((r) => r.id === 'x')?.valorCentavos).toBe(700);
    expect(await service.ensureOfficialPrices()).toBe(0);
  });
  it('quando falta preço na hora de cotar, carrega a tabela e conclui (sem erro "preço ausente")', async () => {
    const { service } = setup();
    const game = { numeros: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10] };
    const priced = await service.priceGames('megasena', [game, game]);
    expect(priced.custoTotalCentavos).toBe(2 * 126000);
    const quote = await service.quote('megasena', [game], 10, 10);
    expect(quote.quotaCents).toBe(Math.ceil(126000 / 10) + Math.round(Math.ceil(126000 / 10) * 0.1));
  });
  it('o catálogo público nunca volta vazio', async () => {
    const { service } = setup();
    expect((await service.catalog()).length).toBe(officialPriceRows().length);
  });
  it('se o banco falhar ao carregar, o início do sistema não cai', async () => {
    const { service, prisma } = setup();
    prisma.precoLoteria.findMany.mockRejectedValueOnce(new Error('banco indisponível'));
    await expect(service.onModuleInit()).resolves.toBeUndefined();
  });
});
