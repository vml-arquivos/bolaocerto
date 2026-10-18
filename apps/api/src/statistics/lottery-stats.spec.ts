import { analyzeGame, chiSquareSurvival, computeStats, equivalentSimpleGames, getLotteryRule, hitProbability, HistoricalDraw, suggestGames, tierProbabilities, validateGame } from '@bolaocerto/shared-types';

function rng(seed: number) {
  let a = seed >>> 0;
  return () => { a = (a + 0x6d2b79f5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
}
function synthetic(modalidade: string, count: number, seed = 7, bias?: (n: number) => number): HistoricalDraw[] {
  const r = getLotteryRule(modalidade)!;
  const rand = rng(seed);
  const out: HistoricalDraw[] = [];
  for (let c = 1; c <= count; c += 1) {
    const pool: number[] = [];
    for (let v = r.min; v <= r.max; v += 1) pool.push(v);
    const keyed = pool.map((value) => ({ value, key: Math.pow(Math.max(rand(), 1e-12), 1 / (bias ? bias(value) : 1)) })).sort((a, b) => b.key - a.key);
    out.push({ contest: c, date: `2024-01-${String((c % 28) + 1).padStart(2, '0')}`, numbers: keyed.slice(0, r.draw).map((item) => item.value).sort((a, b) => a - b) });
  }
  return out;
}

describe('probabilidades exatas (valores oficiais publicados pela CAIXA)', () => {
  const oneIn = (modalidade: string, k: number, hits: number) => tierProbabilities(getLotteryRule(modalidade)!, k).find((t) => t.hits === hits)!.oneIn;
  it('Mega-Sena 6 dezenas', () => {
    expect(oneIn('megasena', 6, 6)).toBe(50_063_860);
    expect(oneIn('megasena', 6, 5)).toBe(154_518);
    expect(oneIn('megasena', 6, 4)).toBe(2_332);
  });
  it('Mega-Sena com 7 dezenas = 7 jogos simples', () => {
    expect(oneIn('megasena', 7, 6)).toBe(Math.round(50_063_860 / 7));
    expect(equivalentSimpleGames(getLotteryRule('megasena')!, 7)).toBe(7);
  });
  it('Lotofácil 15 dezenas', () => {
    expect(oneIn('lotofacil', 15, 15)).toBe(3_268_760);
    expect(oneIn('lotofacil', 15, 14)).toBe(21_792);
    expect(oneIn('lotofacil', 15, 11)).toBe(11);
  });
  it('Quina 5 dezenas', () => { expect(oneIn('quina', 5, 5)).toBe(24_040_016); });
  // 1/p = 11.372.635,89 (a CAIXA publica o valor truncado: 11.372.635)
  it('Lotomania 20 acertos', () => { expect(oneIn('lotomania', 50, 20)).toBe(11_372_636); });
  it('Dupla Sena e Dia de Sorte', () => {
    expect(oneIn('duplasena', 6, 6)).toBe(15_890_700);
    expect(oneIn('diadesorte', 7, 7)).toBe(2_629_575);
  });
  it('probabilidades de todos os acertos somam 1', () => {
    const total = Array.from({ length: 7 }, (_, hits) => hitProbability(60, 6, 6, hits)).reduce((a, b) => a + b, 0);
    expect(total).toBeCloseTo(1, 10);
  });
});

describe('estatísticas do histórico', () => {
  const mega = getLotteryRule('megasena')!;
  const draws = synthetic('megasena', 600);
  const stats = computeStats(mega, draws);

  it('conta cada dezena e soma o total certo', () => {
    expect(stats.sample.draws).toBe(600);
    expect(stats.numbers).toHaveLength(60);
    expect(stats.numbers.reduce((acc, s) => acc + s.count, 0)).toBe(600 * 6);
    expect(stats.sample.firstContest).toBe(1);
    expect(stats.sample.lastContest).toBe(600);
  });
  it('atraso = concursos desde a última aparição', () => {
    const last = draws[draws.length - 1]!;
    for (const value of last.numbers) expect(stats.numbers.find((s) => s.number === value)!.delay).toBe(0);
    const sample = stats.numbers[10]!;
    const lastIdx = draws.map((d) => d.numbers.includes(sample.number)).lastIndexOf(true);
    expect(sample.delay).toBe(draws.length - 1 - lastIdx);
  });
  it('paridade soma 100% e soma média perto da teórica', () => {
    expect(stats.parity.distribution.reduce((acc, item) => acc + item.count, 0)).toBe(600);
    expect(Math.abs((stats.sum.mean ?? 0) - stats.sum.theoreticalMean)).toBeLessThan(12);
  });
  it('sorteio aleatório é "consistente" e um sorteio viciado é detectado', () => {
    expect(stats.uniformity?.conclusion).toBe('consistente');
    const biased = computeStats(mega, synthetic('megasena', 600, 3, (n) => (n <= 10 ? 3 : 1)));
    expect(biased.uniformity?.conclusion).toBe('desvio');
  });
  it('repetição do concurso anterior e pares mais frequentes existem', () => {
    expect(stats.repeats.distribution.length).toBeGreaterThan(0);
    expect(stats.pairs.length).toBe(10);
    expect(stats.pairs[0]!.count).toBeGreaterThanOrEqual(stats.pairs[9]!.count);
  });
  it('funciona sem histórico', () => {
    const empty = computeStats(mega, []);
    expect(empty.sample.draws).toBe(0);
    expect(empty.uniformity).toBeNull();
    expect(empty.numbers.every((s) => s.count === 0)).toBe(true);
  });
  it('Lotomania usa 0..99 e Lotofácil agrupa de 5 em 5', () => {
    const loto = computeStats(getLotteryRule('lotomania')!, synthetic('lotomania', 60));
    expect(loto.numbers[0]!.number).toBe(0);
    expect(loto.numbers).toHaveLength(100);
    const facil = computeStats(getLotteryRule('lotofacil')!, synthetic('lotofacil', 80));
    expect(facil.groups).toHaveLength(5);
  });
  it('qui-quadrado: valor típico não rejeita, valor extremo rejeita', () => {
    expect(chiSquareSurvival(59, 59)).toBeGreaterThan(0.4);
    expect(chiSquareSurvival(150, 59)).toBeLessThan(0.001);
  });
});

describe('análise de um jogo', () => {
  const mega = getLotteryRule('megasena')!;
  const draws = synthetic('megasena', 300);
  it('rejeita jogos inválidos com mensagens claras', () => {
    expect(validateGame(mega, [1, 2, 3]).ok).toBe(false);
    expect(validateGame(mega, [1, 1, 2, 3, 4, 5]).errors.join(' ')).toMatch(/repetidos/);
    expect(validateGame(mega, [0, 2, 3, 4, 5, 6]).errors.join(' ')).toMatch(/01 a 60/);
    expect(validateGame(mega, [1, 2, 3, 4, 5, 61]).ok).toBe(false);
    expect(validateGame(getLotteryRule('lotomania')!, [1, 2, 3]).errors.join(' ')).toMatch(/exatamente 50/);
  });
  it('mostra probabilidade, soma, paridade e histórico de acertos', () => {
    const result = analyzeGame(mega, draws, [4, 12, 23, 35, 44, 58]);
    expect(result.valid).toBe(true);
    expect(result.probabilities[0]!.oneIn).toBe(50_063_860);
    expect(result.sum.value).toBe(176);
    expect(result.parity.odd).toBe(2);
    expect(result.history.hitsDistribution.reduce((acc, item) => acc + item.count, 0)).toBe(300);
    expect(result.notes.join(' ')).toMatch(/mesma chance/);
  });
  it('detecta combinação que já saiu e sequência aritmética / datas', () => {
    const drawn = draws[100]!.numbers;
    const exact = analyzeGame(mega, draws, drawn);
    expect(exact.history.exactMatches).toContain(101);
    expect(exact.notes.join(' ')).toMatch(/já foi sorteada/);
    const sequence = analyzeGame(mega, draws, [5, 10, 15, 20, 25, 30]);
    expect(sequence.notes.join(' ')).toMatch(/sequência/);
    expect(sequence.notes.join(' ')).toMatch(/aniversário/);
  });
  it('jogo com mais dezenas cobre sorteios inteiros', () => {
    const covering = analyzeGame(mega, draws, Array.from({ length: 20 }, (_, i) => i + 1));
    expect(covering.valid).toBe(true);
    expect(covering.equivalentSimpleGames).toBe(38_760);
  });
});

describe('sugestão de jogos', () => {
  const mega = getLotteryRule('megasena')!;
  const draws = synthetic('megasena', 300);
  it('gera jogos válidos, distintos, balanceados e reprodutíveis com a mesma semente', () => {
    const a = suggestGames(mega, draws, { games: 5, seed: 42 });
    const b = suggestGames(mega, draws, { games: 5, seed: 42 });
    expect(a.games.map((g) => g.numbers)).toEqual(b.games.map((g) => g.numbers));
    expect(new Set(a.games.map((g) => g.numbers.join(','))).size).toBe(5);
    for (const game of a.games) {
      expect(validateGame(mega, game.numbers).ok).toBe(true);
      expect(game.odd).toBeGreaterThanOrEqual(1);
      expect(game.odd).toBeLessThanOrEqual(5);
      expect(game.numbers.some((v) => v > 31)).toBe(true);
      expect(game.relaxed).toBe(false);
    }
  });
  it('respeita números fixos, excluídos e tamanho', () => {
    const result = suggestGames(mega, draws, { games: 3, size: 8, fixed: [7, 10], exclude: [13, 22], seed: 1 });
    for (const game of result.games) {
      expect(game.numbers).toHaveLength(8);
      expect(game.numbers).toEqual(expect.arrayContaining([7, 10]));
      expect(game.numbers).not.toContain(13);
      expect(game.numbers).not.toContain(22);
    }
  });
  it('todas as estratégias funcionam, inclusive sem histórico, e para todas as modalidades', () => {
    for (const strategy of ['equilibrado', 'quentes', 'atrasados', 'misto', 'aleatorio'] as const) {
      expect(suggestGames(mega, draws, { games: 2, strategy, seed: 5 }).games).toHaveLength(2);
    }
    for (const modalidade of ['lotofacil', 'quina', 'lotomania', 'duplasena', 'timemania', 'diadesorte']) {
      const rule = getLotteryRule(modalidade)!;
      const result = suggestGames(rule, [], { games: 2, seed: 9 });
      expect(result.games).toHaveLength(2);
      for (const game of result.games) expect(validateGame(rule, game.numbers).ok).toBe(true);
    }
  });
});
