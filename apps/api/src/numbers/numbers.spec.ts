import { BadRequestException } from '@nestjs/common';
import { gameKey, parseGames } from './numbers.rules';
import { NumbersService } from './numbers.service';

describe('regras do banco de números', () => {
  it('a chave não depende da ordem das dezenas', () => {
    expect(gameKey('megasena', [10, 2, 33, 4, 5, 6])).toBe(gameKey('megasena', [2, 4, 5, 6, 10, 33]));
    expect(gameKey('megasena', [1, 2, 3, 4, 5, 6])).not.toBe(gameKey('quina', [1, 2, 3, 4, 5, 6]));
  });
  it('lê um jogo por linha, aceita espaço/vírgula, tira repetidos e ordena', () => {
    const out = parseGames('megasena', '04 12 23 35 44 58\n58,44,35,23,12,4\n1 2 3 4 5 6 7');
    expect(out.erros).toEqual([]);
    expect(out.jogos).toEqual([[4, 12, 23, 35, 44, 58], [1, 2, 3, 4, 5, 6, 7]]);
  });
  it('recusa número fora da faixa, repetido, texto e quantidade errada, dizendo a linha', () => {
    const out = parseGames('megasena', '1 2 3 4 5 61\n1 1 2 3 4 5\n1 2 3 4 5\nabc def\n1 2 3 4 5 6 7 8 9 10 11 12 13 14 15 16 17 18 19 20 21');
    expect(out.jogos).toEqual([]);
    expect(out.erros).toHaveLength(5);
    expect(out.erros[0]).toMatch(/Linha 1.*1 a 60/);
    expect(out.erros[1]).toMatch(/Linha 2.*repetido/);
    expect(out.erros[2]).toMatch(/Linha 3.*6 a 20/);
  });
  it('lotofácil exige de 15 a 20 números de 1 a 25', () => {
    expect(parseGames('lotofacil', '1 2 3 4 5 6 7 8 9 10 11 12 13 14 15').jogos).toHaveLength(1);
    expect(parseGames('lotofacil', '1 2 3 4 5 6').erros).toHaveLength(1);
    expect(parseGames('loteca', '1 2 3').erros[0]).toMatch(/Modalidade/);
  });
});

describe('NumbersService', () => {
  function setup(existing: string[] = []) {
    const store = new Map<string, any>(existing.map((chave) => [chave, { chave, usos: 0 }]));
    const prisma: any = { bancoNumeros: {
      createMany: jest.fn(async ({ data }: any) => { let count = 0; for (const row of data) if (!store.has(row.chave)) { store.set(row.chave, { ...row, usos: 0 }); count += 1; } return { count }; }),
      findMany: jest.fn(async ({ where }: any) => (where?.chave?.in ?? []).filter((k: string) => store.has(k)).map((chave: string) => ({ chave }))),
      updateMany: jest.fn(async ({ where }: any) => { for (const k of where.chave.in) { const row = store.get(k); if (row) row.usos += 1; } return { count: 1 }; }),
      findUnique: jest.fn(async ({ where }: any) => (where.id === 'x' ? { id: 'x', modalidade: 'megasena', numeros: [1, 2, 3, 4, 5, 6] } : null)),
      delete: jest.fn(async () => ({})),
    } };
    const audit: any = { record: jest.fn().mockResolvedValue(undefined) };
    const pools: any = { generateGames: jest.fn(async (dto: any) => ({ modalidade: dto.modalidade, estrategia: 'equilibrado', quantidade: 3, dezenas: dto.dezenas, custoTotal: 126, jogos: [[1, 2, 3, 4, 5, 6, 7], [8, 9, 10, 11, 12, 13, 14], [1, 2, 3, 4, 5, 6, 7]].map((numeros, i) => ({ ordem: i + 1, numeros, custo: 42 })), aviso: '' })) };
    return { service: new NumbersService(prisma, audit, pools), prisma, audit, store };
  }
  it('gera e guarda no banco, sem repetir jogo que já existe', async () => {
    const { service, store } = setup([gameKey('megasena', [8, 9, 10, 11, 12, 13, 14])]);
    const out = await service.generate({ modalidade: 'megasena', quantidade: 3, dezenas: 7 } as any, 'u1');
    expect(out.jogos).toHaveLength(3);
    expect(store.size).toBe(2); // 1 já existia, o 3º é igual ao 1º
    expect(out.salvo).toBe(true);
  });
  it('salvar:false só mostra, não grava', async () => {
    const { service, prisma } = setup();
    const out = await service.generate({ modalidade: 'megasena', quantidade: 3, dezenas: 7, salvar: false } as any, 'u1');
    expect(prisma.bancoNumeros.createMany).not.toHaveBeenCalled();
    expect(out.salvo).toBe(false);
    await expect(service.generate({ modalidade: 'megasena', quantidade: 1, dezenas: 30 } as any, 'u1')).rejects.toBeInstanceOf(BadRequestException);
  });
  it('digitados: guarda os novos, conta repetidos e recusa linha inválida', async () => {
    const { service } = setup([gameKey('quina', [1, 2, 3, 4, 5])]);
    expect(await service.add({ modalidade: 'quina', jogos: '1 2 3 4 5\n6 7 8 9 10' } as any, 'u1')).toEqual({ guardados: 1, repetidos: 1 });
    await expect(service.add({ modalidade: 'quina', jogos: '1 2 3' } as any, 'u1')).rejects.toThrow(/Linha 1/);
    await expect(service.add({ modalidade: 'quina', jogos: '  ' } as any, 'u1')).rejects.toThrow(/ao menos um/);
  });
  it('uso em bolão: soma uso no que existe e guarda o novo como "bolao"', async () => {
    const { service, store } = setup([gameKey('megasena', [1, 2, 3, 4, 5, 6])]);
    const out = await service.markUsed({ modalidade: 'megasena', jogos: [{ numeros: [6, 5, 4, 3, 2, 1] }, { numeros: [7, 8, 9, 10, 11, 12] }, { numeros: [7, 8, 9, 10, 11, 12] }, { numeros: [1, 2] }] } as any, 'u1');
    expect(out).toEqual({ atualizados: 1, novos: 1 });
    expect(store.get(gameKey('megasena', [1, 2, 3, 4, 5, 6])).usos).toBe(1);
    expect(store.get(gameKey('megasena', [7, 8, 9, 10, 11, 12])).origem).toBe('bolao');
  });
  it('remove registra no histórico e some', async () => {
    const { service, audit, prisma } = setup();
    expect(await service.remove('x', 'u1')).toEqual({ removido: true });
    expect(prisma.bancoNumeros.delete).toHaveBeenCalled();
    expect(audit.record).toHaveBeenCalled();
    await expect(service.remove('nao', 'u1')).rejects.toThrow(/não encontrado/);
  });
});
