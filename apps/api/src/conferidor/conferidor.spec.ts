import { BadRequestException, NotFoundException } from '@nestjs/common';
import { conferirJogos } from './conferidor';
import { ConferidorService } from './conferidor.service';

const megaTiers = [
  { descricaoFaixa: '6 acertos', numeroDeGanhadores: 0, valorPremio: 0 },
  { descricaoFaixa: '5 acertos', numeroDeGanhadores: 40, valorPremio: 52000.5 },
  { descricaoFaixa: '4 acertos', numeroDeGanhadores: 3000, valorPremio: 900 },
];
const drawn = [4, 12, 23, 35, 41, 58];

describe('conferirJogos', () => {
  it('conta acertos, destaca os números e informa a faixa e o valor oficial', () => {
    const [a, b] = conferirJogos('megasena', [[4, 12, 23, 35, 41, 10], [1, 2, 3, 5, 6, 7]], drawn, [], megaTiers);
    expect(a).toMatchObject({ acertos: 5, premia: true, faixa: 'Quina (5 acertos)', valorFaixa: 52000.5, ganhadoresFaixa: 40, numerosAcertados: [4, 12, 23, 35, 41] });
    expect(b).toMatchObject({ acertos: 0, premia: false, faixa: null, valorFaixa: null });
  });
  it('faixa premiada sem ganhador mostra a faixa e nenhum valor', () => {
    const [game] = conferirJogos('megasena', [[4, 12, 23, 35, 41, 58]], drawn, [], megaTiers);
    expect(game).toMatchObject({ acertos: 6, premia: true, valorFaixa: null, ganhadoresFaixa: 0 });
  });
  it('recusa jogo inválido sem derrubar os outros', () => {
    const result = conferirJogos('megasena', [[1, 2, 3], [1, 1, 2, 3, 4, 5], [1, 2, 3, 4, 5, 61], [1, 2, 3, 4, 5, 6]], drawn, [], megaTiers);
    expect(result.map((g) => Boolean(g.erro))).toEqual([true, true, true, false]);
    expect(result[0]?.erro).toMatch(/6 a 20/);
    expect(result[1]?.erro).toMatch(/repetido/);
    expect(result[2]?.erro).toMatch(/1 a 60/);
  });
  it('Lotomania aceita o zero (00) como dezena', () => {
    const game = Array.from({ length: 50 }, (_, i) => i);
    const [g] = conferirJogos('lotomania', [game], Array.from({ length: 20 }, (_, i) => i), [], []);
    expect(g).toMatchObject({ acertos: 20, premia: true });
  });
  it('Dupla Sena confere os dois sorteios e usa o melhor', () => {
    const tiers = [{ descricaoFaixa: '4 acertos', numeroDeGanhadores: 10, valorPremio: 300 }];
    const [g] = conferirJogos('duplasena', [[1, 2, 3, 4, 5, 6]], [1, 2, 9, 10, 11, 12], [1, 2, 3, 4, 20, 21], tiers);
    expect(g).toMatchObject({ acertos: 2, acertosSegundoSorteio: 4, premia: true, valorFaixa: 300 });
  });
  it('confere no máximo 20 jogos', () => {
    expect(conferirJogos('megasena', Array.from({ length: 30 }, () => [1, 2, 3, 4, 5, 6]), drawn, [], [])).toHaveLength(20);
  });
});

describe('ConferidorService', () => {
  const prisma = (contest: unknown): any => ({ concurso: { findFirst: jest.fn().mockResolvedValue(contest) } });
  const contest = { numeroConcurso: 2900, dataSorteio: new Date('2026-11-07'), nomeEspecial: null, resultado: { numerosSorteados: drawn, numerosSegundoSorteio: [], listaRateioPremio: megaTiers } };
  it('usa o último resultado e devolve os números sorteados', async () => {
    const service = new ConferidorService(prisma(contest));
    const result = await service.check({ modalidade: 'megasena', jogos: [[4, 12, 23, 1, 2, 3]] });
    expect(result).toMatchObject({ concurso: 2900, numerosSorteados: drawn, aviso: null });
    expect(result.jogos[0]).toMatchObject({ acertos: 3 });
  });
  it('avisa que o Time do Coração e o Mês de Sorte não entram', async () => {
    const service = new ConferidorService(prisma(contest));
    expect((await service.check({ modalidade: 'diadesorte', jogos: [[1, 2, 3, 4, 5, 6, 7]] })).aviso).toMatch(/Mês de Sorte/);
  });
  it('sem resultado ou modalidade desconhecida dá erro claro', async () => {
    await expect(new ConferidorService(prisma(null)).check({ modalidade: 'megasena', jogos: [[1, 2, 3, 4, 5, 6]] })).rejects.toBeInstanceOf(NotFoundException);
    await expect(new ConferidorService(prisma(contest)).check({ modalidade: 'loteca', jogos: [[1]] })).rejects.toBeInstanceOf(BadRequestException);
    await expect(new ConferidorService(prisma(contest)).check({ modalidade: 'megasena', jogos: [] })).rejects.toBeInstanceOf(BadRequestException);
  });
});
