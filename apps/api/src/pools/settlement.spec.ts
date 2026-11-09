import { countHits, normalizeCaixaContestPayload, parseTierHits, settleGames, splitPrize, supportsAutoSettlement } from '@bolaocerto/shared-types';

const MEGA_TIERS = [
  { descricaoFaixa: '6 acertos', numeroDeGanhadores: 1, valorPremio: 50_000_000 },
  { descricaoFaixa: '5 acertos', numeroDeGanhadores: 120, valorPremio: 52_000.5 },
  { descricaoFaixa: '4 acertos', numeroDeGanhadores: 6000, valorPremio: 900.25 },
];

describe('Apuração de bolões', () => {
  it('lê as faixas da CAIXA (número, palavra, 2º sorteio) e ignora faixas sem acertos', () => {
    expect(parseTierHits('6 acertos')).toEqual({ acertos: 6, segundoSorteio: false });
    expect(parseTierHits('Quina')).toEqual({ acertos: 5, segundoSorteio: false });
    expect(parseTierHits('5 acertos - 2º sorteio')).toEqual({ acertos: 5, segundoSorteio: true });
    expect(parseTierHits('Time do Coração')).toBeNull();
    expect(parseTierHits('6 acertos + 2 trevos')).toBeNull();
    expect(parseTierHits('')).toBeNull();
  });

  it('conta acertos sem duplicar números repetidos', () => {
    expect(countHits([1, 2, 3, 3], [3, 4, 1])).toBe(2);
  });

  it('soma o prêmio de CADA jogo do bolão (antes só o primeiro jogo era conferido)', () => {
    const result = settleGames({
      games: [{ ordem: 1, numeros: [1, 2, 3, 4, 5, 6] }, { ordem: 2, numeros: [1, 2, 3, 4, 5, 60] }, { ordem: 3, numeros: [1, 2, 3, 4, 59, 60] }, { ordem: 4, numeros: [10, 20, 30, 40, 50, 59] }],
      drawn: [1, 2, 3, 4, 5, 6], tiers: MEGA_TIERS,
    });
    expect(result.jogos.map((game) => game.acertos)).toEqual([6, 5, 4, 0]);
    expect(result.premioTotal).toBe(50_000_000 + 52_000.5 + 900.25);
    expect(result.teveGanhador).toBe(true);
    expect(result.melhorFaixa).toBe('6 acertos');
  });

  it('sem faixa premiada: sem ganhador e prêmio zero', () => {
    const result = settleGames({ games: [{ ordem: 1, numeros: [10, 20, 30, 40, 50, 59] }], drawn: [1, 2, 3, 4, 5, 6], tiers: MEGA_TIERS });
    expect(result).toMatchObject({ premioTotal: 0, teveGanhador: false, melhorFaixa: null });
  });

  it('faixa sem ganhadores (acumulou) não paga nada', () => {
    const result = settleGames({ games: [{ ordem: 1, numeros: [1, 2, 3, 4, 5, 6] }], drawn: [1, 2, 3, 4, 5, 6], tiers: [{ descricaoFaixa: '6 acertos', numeroDeGanhadores: 0, valorPremio: 0 }] });
    expect(result.teveGanhador).toBe(false);
  });

  it('Lotomania paga também 0 acertos', () => {
    const drawn = Array.from({ length: 20 }, (_, i) => i + 1);
    const game = { ordem: 1, numeros: Array.from({ length: 50 }, (_, i) => i + 21) }; // 50 dezenas, nenhuma sorteada
    const result = settleGames({ games: [game], drawn, tiers: [{ descricaoFaixa: '0 acertos', numeroDeGanhadores: 10, valorPremio: 120_000 }] });
    expect(result.premioTotal).toBe(120_000);
  });

  it('Dupla Sena: o jogo concorre nos dois sorteios', () => {
    const tiers = [{ descricaoFaixa: '6 acertos', numeroDeGanhadores: 1, valorPremio: 1_000_000 }, { descricaoFaixa: '4 acertos', numeroDeGanhadores: 500, valorPremio: 100 }];
    const game = { ordem: 1, numeros: [1, 2, 3, 4, 5, 6] };
    const result = settleGames({ games: [game], drawn: [1, 2, 3, 4, 40, 41], secondDraw: [1, 2, 3, 4, 5, 6], tiers });
    expect(result.jogos[0]!.premios.map((prize) => [prize.sorteio, prize.acertos, prize.valor])).toEqual([[1, 4, 100], [2, 6, 1_000_000]]);
    expect(result.premioTotal).toBe(1_000_100);
  });

  it('Dupla Sena com faixas separadas por sorteio não mistura os valores', () => {
    const tiers = [{ descricaoFaixa: '6 acertos', numeroDeGanhadores: 1, valorPremio: 1000 }, { descricaoFaixa: '6 acertos - 2º sorteio', numeroDeGanhadores: 1, valorPremio: 777 }];
    const result = settleGames({ games: [{ ordem: 1, numeros: [1, 2, 3, 4, 5, 6] }], drawn: [1, 2, 3, 4, 5, 6], secondDraw: [1, 2, 3, 4, 5, 6], tiers });
    expect(result.premioTotal).toBe(1777);
  });

  it('modalidades com conferência manual não são apuradas automaticamente', () => {
    expect(supportsAutoSettlement('megasena')).toBe(true);
    expect(supportsAutoSettlement('supersete')).toBe(false);
    expect(supportsAutoSettlement('loteca')).toBe(false);
  });
});

describe('Divisão do prêmio entre as cotas', () => {
  it('a soma das partes é exatamente o total, mesmo com dízimas', () => {
    const shares = [{ id: 'a', quantidade: 1 }, { id: 'b', quantidade: 1 }, { id: 'c', quantidade: 1 }];
    const parts = splitPrize(100, shares);
    const sum = [...parts.values()].reduce((acc, value) => acc + Math.round(value * 100), 0);
    expect(sum).toBe(10_000);
    expect([...parts.values()].sort()).toEqual([33.33, 33.33, 33.34]);
  });

  it('é proporcional à quantidade de cotas', () => {
    const parts = splitPrize(1000, [{ id: 'a', quantidade: 1 }, { id: 'b', quantidade: 3 }]);
    expect(parts.get('a')).toBe(250);
    expect(parts.get('b')).toBe(750);
  });

  it('é determinístico (mesma entrada, mesma divisão) e não falha sem cotas ou sem prêmio', () => {
    const shares = [{ id: 'x', quantidade: 2 }, { id: 'y', quantidade: 1 }, { id: 'z', quantidade: 4 }];
    expect([...splitPrize(12345.67, shares)]).toEqual([...splitPrize(12345.67, shares)]);
    expect(splitPrize(0, shares).get('x')).toBe(0);
    expect(splitPrize(100, []).size).toBe(0);
  });

  it('prêmio grande (R$ 100 milhões) mantém a precisão de centavos', () => {
    const shares = Array.from({ length: 997 }, (_, i) => ({ id: `s${i}`, quantidade: (i % 5) + 1 }));
    const parts = splitPrize(100_000_000.01, shares);
    expect([...parts.values()].reduce((acc, value) => acc + Math.round(value * 100), 0)).toBe(10_000_000_001);
  });
});

describe('faixa especial: Time do Coração e Mês de Sorte', () => {
  const tiers = [
    { descricaoFaixa: '7 acertos', numeroDeGanhadores: 0, valorPremio: 0 },
    { descricaoFaixa: '3 acertos', numeroDeGanhadores: 10, valorPremio: 4 },
    { descricaoFaixa: 'Time do Coração', numeroDeGanhadores: 500, valorPremio: 7.5 },
  ];
  const drawn = [1, 2, 3, 40, 41, 42, 43];
  const game = (selecao: { timeCoracao?: string; mesSorte?: number } | null, numeros = [1, 2, 3, 10, 11, 12, 13]) => ({ ordem: 1, numeros, selecao });

  it('acertou o time: soma o prêmio do Time do Coração ao das dezenas', () => {
    const result = settleGames({ games: [game({ timeCoracao: 'Vasco da Gama/RJ' })], drawn, tiers, modality: 'timemania', drawnSpecial: 'VASCO DA GAMA/RJ' });
    expect(result.faixaEspecialNaoConferida).toBeUndefined();
    expect(result.premioTotal).toBe(11.5);
    expect(result.jogos[0]!.premios.map((p) => p.faixa)).toEqual(['3 acertos', 'Time do Coração']);
  });

  it('acertar só o time (sem dezenas premiadas) também paga a faixa', () => {
    const result = settleGames({ games: [game({ timeCoracao: 'Vasco' }, [10, 11, 12, 13, 14, 15, 16])], drawn, tiers, modality: 'timemania', drawnSpecial: 'VASCO/RJ' });
    expect(result.premioTotal).toBe(7.5);
    expect(result.teveGanhador).toBe(true);
  });

  it('time diferente: só as dezenas contam e não há dúvida', () => {
    const result = settleGames({ games: [game({ timeCoracao: 'Flamengo/RJ' })], drawn, tiers, modality: 'timemania', drawnSpecial: 'VASCO DA GAMA/RJ' });
    expect(result.premioTotal).toBe(4);
    expect(result.faixaEspecialNaoConferida).toBeUndefined();
  });

  it('sem o time guardado no jogo ou sem o nome sorteado: mantém as dezenas e marca para conferir (não adivinha)', () => {
    const semJogo = settleGames({ games: [game(null)], drawn, tiers, modality: 'timemania', drawnSpecial: 'VASCO/RJ' });
    expect(semJogo.premioTotal).toBe(4);
    expect(semJogo.faixaEspecialNaoConferida).toMatch(/guardado/);
    const semNome = settleGames({ games: [game({ timeCoracao: 'Vasco' })], drawn, tiers, modality: 'timemania' });
    expect(semNome.premioTotal).toBe(4);
    expect(semNome.faixaEspecialNaoConferida).toMatch(/nome sorteado/);
  });

  it('nomes parecidos (um contém o outro, como "Sport" e "Sport Recife") ficam para conferência', () => {
    const result = settleGames({ games: [game({ timeCoracao: 'Sport' })], drawn, tiers, modality: 'timemania', drawnSpecial: 'SPORT RECIFE/PE' });
    expect(result.premioTotal).toBe(4);
    expect(result.faixaEspecialNaoConferida).toMatch(/não bate com clareza/);
  });

  it('Dia de Sorte: confere o Mês de Sorte por nome ou número', () => {
    const monthTiers = [{ descricaoFaixa: '4 acertos', numeroDeGanhadores: 5, valorPremio: 10 }, { descricaoFaixa: 'Mês de Sorte', numeroDeGanhadores: 900, valorPremio: 2.5 }];
    const hit = settleGames({ games: [{ ordem: 1, numeros: [1, 2, 3, 4, 5, 6, 7], selecao: { mesSorte: 3 } }], drawn: [20, 21, 22, 23, 24, 25, 26], tiers: monthTiers, modality: 'diadesorte', drawnSpecial: 'Março' });
    expect(hit.premioTotal).toBe(2.5);
    const miss = settleGames({ games: [{ ordem: 1, numeros: [1, 2, 3, 4, 5, 6, 7], selecao: { mesSorte: 4 } }], drawn: [20, 21, 22, 23, 24, 25, 26], tiers: monthTiers, modality: 'diadesorte', drawnSpecial: '3' });
    expect(miss.premioTotal).toBe(0);
    expect(miss.faixaEspecialNaoConferida).toBeUndefined();
  });

  it('sem ganhadores na faixa especial ou sem informar a modalidade, nada muda (compatível com a apuração antiga)', () => {
    const semGanhadores = settleGames({ games: [game(null)], drawn, tiers: tiers.map((t) => (t.descricaoFaixa === 'Time do Coração' ? { ...t, numeroDeGanhadores: 0 } : t)), modality: 'timemania', drawnSpecial: 'VASCO/RJ' });
    expect(semGanhadores.premioTotal).toBe(4);
    expect(semGanhadores.faixaEspecialNaoConferida).toBeUndefined();
    const antiga = settleGames({ games: [game(null)], drawn, tiers });
    expect(antiga.premioTotal).toBe(4);
    expect(antiga.faixaEspecialNaoConferida).toBeUndefined();
  });

  it('o payload da CAIXA traz o nome sorteado', () => {
    expect(normalizeCaixaContestPayload({ numero: 1, nomeTimeCoracaoMesSorte: 'VASCO DA GAMA/RJ' }).nomeTimeCoracaoMesSorte).toBe('VASCO DA GAMA/RJ');
    expect(normalizeCaixaContestPayload({ numero: 1 }).nomeTimeCoracaoMesSorte).toBeUndefined();
  });
});
