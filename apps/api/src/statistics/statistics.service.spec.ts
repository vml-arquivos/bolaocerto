import { BadRequestException, NotFoundException } from '@nestjs/common';
import { parseNumberList, StatisticsService } from './statistics.service';

function fakeRows(modalidade: string, count: number) {
  const rows: any[] = [];
  for (let c = count; c >= 1; c -= 1) {
    const base = modalidade === 'duplasena' ? 50 : 60;
    const pick = (offset: number) => Array.from({ length: 6 }, (_, i) => ((c * 7 + i * 9 + offset) % base) + 1).sort((a, b) => a - b);
    rows.push({ numerosSorteados: pick(0), numerosSegundoSorteio: modalidade === 'duplasena' ? pick(3) : [], listaRateioPremio: [], concurso: { numeroConcurso: c, dataSorteio: new Date(Date.UTC(2024, 0, 1 + c)), acumulado: false } });
  }
  return rows;
}

function build(count = 120) {
  const calls: string[] = [];
  const prisma: any = {
    resultado: { findMany: jest.fn(async (args: any) => { calls.push(args.where.concurso.modalidade); return fakeRows(args.where.concurso.modalidade, count).slice(0, args.take ?? 1000); }) },
    concurso: { findFirst: jest.fn(async () => ({ numeroConcurso: count + 1, dataSorteio: new Date('2024-06-01'), valorEstimadoPremio: 1500000, acumulado: true })) },
  };
  const service = new StatisticsService(prisma, { get: () => undefined } as any, { record: jest.fn() } as any);
  return { service, prisma, calls };
}

describe('StatisticsService', () => {
  it('lê números separados por vírgula/espaço', () => {
    expect(parseNumberList('1, 2  3,x,-4,5.5')).toEqual([1, 2, 3]);
    expect(parseNumberList(undefined)).toEqual([]);
  });

  it('modalidade sem dezenas (loteca) devolve 404 com a lista das disponíveis', async () => {
    const { service } = build();
    await expect(service.modality('loteca')).rejects.toBeInstanceOf(NotFoundException);
    await expect(service.modality('loteca')).rejects.toThrow(/megasena/);
  });

  it('painel da modalidade traz estatísticas, últimos resultados, próximo concurso e probabilidades', async () => {
    const { service } = build();
    const result = await service.modality('megasena');
    expect(result.sample.draws).toBe(120);
    expect(result.ultimosResultados).toHaveLength(10);
    expect(result.proximoConcurso?.premioEstimado).toBe(1500000);
    expect(result.probabilidades.faixas[0]!.oneIn).toBe(50_063_860);
    expect(result.disclaimer).toMatch(/independente/);
  });

  it('Dupla Sena conta os dois sorteios de cada concurso', async () => {
    const { service } = build(50);
    const result = await service.modality('duplasena');
    expect(result.sample.draws).toBe(100);
    expect(result.concursosNaBase).toBe(50);
  });

  it('usa cache: duas consultas seguidas carregam o histórico uma vez', async () => {
    const { service, prisma } = build();
    await service.analyze('megasena', { numeros: [1, 2, 3, 4, 5, 6] });
    await service.analyze('megasena', { numeros: [7, 8, 9, 10, 11, 12] });
    expect(prisma.resultado.findMany).toHaveBeenCalledTimes(1);
    service.invalidate('megasena');
    await service.analyze('megasena', { numeros: [1, 2, 3, 4, 5, 6] });
    expect(prisma.resultado.findMany).toHaveBeenCalledTimes(2);
  });

  it('valida jogo, tamanho e números fixos com mensagens em português', async () => {
    const { service } = build();
    await expect(service.analyze('megasena', { numeros: [1, 2, 3] })).rejects.toBeInstanceOf(BadRequestException);
    expect(() => service.probabilities('megasena', { dezenas: 25 })).toThrow(/de 6 a 20/);
    await expect(service.suggest('megasena', { fixos: '1,2,3,4,5,6,7' })).rejects.toThrow(/mais números fixos/);
    await expect(service.suggest('megasena', { fixos: '99' })).rejects.toThrow(/entre 1 e 60/);
  });

  it('sugere jogos válidos respeitando o que o apostador pediu', async () => {
    const { service } = build();
    const result = await service.suggest('megasena', { jogos: 3, dezenas: 7, fixos: '10,20', excluir: '13', estrategia: 'misto' });
    expect(result.games).toHaveLength(3);
    for (const game of result.games) { expect(game.numbers).toHaveLength(7); expect(game.numbers).toEqual(expect.arrayContaining([10, 20])); expect(game.numbers).not.toContain(13); }
  });

  it('visão geral lista todas as modalidades com dezenas', async () => {
    const { service } = build();
    const result = await service.overview();
    expect(result.modalidades.map((m) => m.modalidade).sort()).toEqual(['diadesorte', 'duplasena', 'lotofacil', 'lotomania', 'megasena', 'quina', 'timemania']);
  });
});
