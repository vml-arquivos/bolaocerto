import { BadRequestException } from '@nestjs/common';
import { officialPriceRows } from '../pricing/pricing.engine';
import { PricingService } from '../pricing/pricing.service';
import { StatisticsService } from '../statistics/statistics.service';
import { PoolsService } from './pools.service';

function build() {
  const rows = officialPriceRows();
  const prisma: any = {
    resultado: { findMany: jest.fn(async () => []) },
    precoLoteria: { findMany: jest.fn(async ({ where }: any) => rows.filter((r) => r.modalidade === where.modalidade && where.chave.in.includes(r.chave)).map((r, i) => ({ id: `p${i}`, ...r }))) },
  };
  const statistics = new StatisticsService(prisma, { get: () => undefined } as any, { record: jest.fn() } as any);
  const pricing = new PricingService(prisma);
  const pools = new PoolsService(prisma, { record: jest.fn() } as any, undefined, pricing, statistics);
  return { pools };
}

describe('gerador de jogos do bolão', () => {
  it('gera a quantidade pedida de jogos distintos, com o tamanho pedido, e soma o custo da tabela CAIXA', async () => {
    const { pools } = build();
    const out = await pools.generateGames({ modalidade: 'megasena', quantidade: 35, dezenas: 8 });
    expect(out.jogos).toHaveLength(35);
    expect(new Set(out.jogos.map((g) => g.numeros.join('-'))).size).toBe(35);
    out.jogos.forEach((g) => { expect(g.numeros).toHaveLength(8); expect(new Set(g.numeros).size).toBe(8); expect(Math.min(...g.numeros)).toBeGreaterThanOrEqual(1); expect(Math.max(...g.numeros)).toBeLessThanOrEqual(60); });
    // Mega-Sena com 8 números = 28 apostas simples
    expect(out.custoPorJogo).toBe(6 * 28);
    expect(out.custoTotalCentavos).toBe(35 * 16800);
    expect(out.custoTotal).toBe(5880);
    expect(out.aviso).toMatch(/independente/);
  });

  it('o valor muda conforme a quantidade de números escolhida (tabela oficial)', async () => {
    const { pools } = build();
    const custos = await Promise.all([6, 7, 9, 12].map(async (d) => (await pools.generateGames({ modalidade: 'megasena', quantidade: 1, dezenas: d })).custoPorJogo));
    expect(custos).toEqual([6, 42, 504, 5544]);
    expect((await pools.generateGames({ modalidade: 'lotofacil', quantidade: 2, dezenas: 16 })).custoPorJogo).toBe(56);
    expect((await pools.generateGames({ modalidade: 'quina', quantidade: 2, dezenas: 6 })).custoTotal).toBe(36);
  });

  it('respeita números fixos e excluídos, e recusa tamanho fora da regra ou pedido impossível', async () => {
    const { pools } = build();
    const out = await pools.generateGames({ modalidade: 'megasena', quantidade: 10, dezenas: 7, fixos: '10,20', excluir: '13,14', estrategia: 'aleatorio' });
    out.jogos.forEach((g) => { expect(g.numeros).toEqual(expect.arrayContaining([10, 20])); expect(g.numeros).not.toContain(13); });
    await expect(pools.generateGames({ modalidade: 'megasena', quantidade: 1, dezenas: 21 })).rejects.toThrow(/de 6 a 20/);
    await expect(pools.generateGames({ modalidade: 'lotofacil', quantidade: 3, dezenas: 15, fixos: '1,2,3,4,5,6,7,8,9,10,11,12,13,14,15' })).rejects.toBeInstanceOf(BadRequestException);
  });

  it('gera até 100 jogos de uma vez', async () => {
    const { pools } = build();
    const out = await pools.generateGames({ modalidade: 'quina', quantidade: 100, dezenas: 5, estrategia: 'aleatorio' });
    expect(out.jogos).toHaveLength(100);
    expect(out.custoTotal).toBe(300);
    expect(out.jogos.map((g) => g.ordem)).toEqual(Array.from({ length: 100 }, (_, i) => i + 1));
  });
});
