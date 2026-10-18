import { CaixaContestPayload, parseCaixaDate } from './index';

/**
 * Estatísticas e matemática das loterias de dezenas.
 *
 * IMPORTANTE (também exibido ao usuário): cada sorteio é independente. Nenhum cálculo daqui altera a chance de
 * uma combinação — todas as combinações do mesmo tamanho têm exatamente a mesma probabilidade. O módulo organiza o
 * histórico (frequência, atraso, padrões) e calcula as probabilidades EXATAS; as "sugestões" apenas montam jogos
 * equilibrados e menos populares, o que não aumenta a chance de acertar.
 */

export interface LotteryRule {
  modalidade: string;
  nome: string;
  /** Menor e maior dezena do universo (ex.: 1..60; Lotomania 0..99). */
  min: number;
  max: number;
  /** Quantidade de dezenas sorteadas. */
  draw: number;
  /** Quantidade de dezenas que o apostador pode marcar. */
  betMin: number;
  betMax: number;
  /** Número de acertos que premiam (do maior para o menor). */
  tiers: number[];
  tierNames: Record<number, string>;
  /** Tem dois sorteios por concurso (Dupla Sena). */
  secondDraw?: boolean;
}

const rule = (r: LotteryRule): LotteryRule => r;

export const LOTTERY_RULES: Record<string, LotteryRule> = {
  megasena: rule({ modalidade: 'megasena', nome: 'Mega-Sena', min: 1, max: 60, draw: 6, betMin: 6, betMax: 20, tiers: [6, 5, 4], tierNames: { 6: 'Sena (6 acertos)', 5: 'Quina (5 acertos)', 4: 'Quadra (4 acertos)' } }),
  lotofacil: rule({ modalidade: 'lotofacil', nome: 'Lotofácil', min: 1, max: 25, draw: 15, betMin: 15, betMax: 20, tiers: [15, 14, 13, 12, 11], tierNames: { 15: '15 acertos', 14: '14 acertos', 13: '13 acertos', 12: '12 acertos', 11: '11 acertos' } }),
  quina: rule({ modalidade: 'quina', nome: 'Quina', min: 1, max: 80, draw: 5, betMin: 5, betMax: 15, tiers: [5, 4, 3, 2], tierNames: { 5: 'Quina (5 acertos)', 4: 'Quadra (4 acertos)', 3: 'Terno (3 acertos)', 2: 'Duque (2 acertos)' } }),
  lotomania: rule({ modalidade: 'lotomania', nome: 'Lotomania', min: 0, max: 99, draw: 20, betMin: 50, betMax: 50, tiers: [20, 19, 18, 17, 16, 0], tierNames: { 20: '20 acertos', 19: '19 acertos', 18: '18 acertos', 17: '17 acertos', 16: '16 acertos', 0: '0 acertos' } }),
  duplasena: rule({ modalidade: 'duplasena', nome: 'Dupla Sena', min: 1, max: 50, draw: 6, betMin: 6, betMax: 15, tiers: [6, 5, 4, 3], tierNames: { 6: 'Sena (6 acertos)', 5: 'Quina (5 acertos)', 4: 'Quadra (4 acertos)', 3: 'Terno (3 acertos)' }, secondDraw: true }),
  timemania: rule({ modalidade: 'timemania', nome: 'Timemania', min: 1, max: 80, draw: 7, betMin: 10, betMax: 10, tiers: [7, 6, 5, 4, 3], tierNames: { 7: '7 acertos', 6: '6 acertos', 5: '5 acertos', 4: '4 acertos', 3: '3 acertos' } }),
  diadesorte: rule({ modalidade: 'diadesorte', nome: 'Dia de Sorte', min: 1, max: 31, draw: 7, betMin: 7, betMax: 15, tiers: [7, 6, 5, 4], tierNames: { 7: '7 acertos', 6: '6 acertos', 5: '5 acertos', 4: '4 acertos' } }),
};

export function getLotteryRule(modalidade: string): LotteryRule | null {
  return LOTTERY_RULES[modalidade] ?? null;
}

export function supportedStatisticsModalities(): string[] {
  return Object.keys(LOTTERY_RULES);
}

export const STATS_DISCLAIMER =
  'Cada sorteio é independente e aleatório: números que saíram muito ou pouco não ficam "mais prováveis" no próximo concurso. ' +
  'Estas informações são estatísticas do passado e cálculos de probabilidade — não são previsão nem garantia de prêmio. Jogue com responsabilidade (18+).';

// ───────────────────────── Matemática básica ─────────────────────────

const logFactorialCache: number[] = [0, 0];
function logFactorial(n: number): number {
  for (let i = logFactorialCache.length; i <= n; i += 1) logFactorialCache[i] = (logFactorialCache[i - 1] ?? 0) + Math.log(i);
  return logFactorialCache[n] ?? 0;
}
function logChoose(n: number, k: number): number {
  if (k < 0 || k > n) return Number.NEGATIVE_INFINITY;
  return logFactorial(n) - logFactorial(k) - logFactorial(n - k);
}

/** Combinações C(n, k) como número (suficiente para até C(100, 50) ≈ 1e29 com precisão relativa de ~1e-15). */
export function choose(n: number, k: number): number {
  const value = Math.exp(logChoose(n, k));
  return Number.isFinite(value) ? Math.round(value) : 0;
}

/** Probabilidade hipergeométrica: marcar `k` dezenas e acertar exatamente `hits` das `drawSize` sorteadas num universo de `universe`. */
export function hitProbability(universe: number, drawSize: number, k: number, hits: number): number {
  const log = logChoose(k, hits) + logChoose(universe - k, drawSize - hits) - logChoose(universe, drawSize);
  return Number.isFinite(log) ? Math.exp(log) : 0;
}

export interface TierProbability {
  hits: number;
  label: string;
  probability: number;
  /** "1 em N" (arredondado). */
  oneIn: number;
  /** Percentual legível (ex.: 0,0000019%). */
  percent: number;
}

export function universeSize(r: LotteryRule): number {
  return r.max - r.min + 1;
}

/** Probabilidades exatas de cada faixa de prêmio para um jogo com `k` dezenas. */
export function tierProbabilities(r: LotteryRule, k: number = r.betMin): TierProbability[] {
  const N = universeSize(r);
  return r.tiers.map((hits) => {
    const probability = hitProbability(N, r.draw, k, hits);
    return { hits, label: r.tierNames[hits] ?? `${hits} acertos`, probability, oneIn: probability > 0 ? Math.round(1 / probability) : 0, percent: probability * 100 };
  });
}

/** Quantos jogos simples (do tamanho sorteado) cabem num jogo com `k` dezenas — base do preço de apostas múltiplas. */
export function equivalentSimpleGames(r: LotteryRule, k: number): number {
  return choose(k, Math.min(k, r.betMin));
}

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const t = 1 / (1 + 0.3275911 * ax);
  const y = 1 - (((((1.061405429 * t - 1.453152027) * t) + 1.421413741) * t - 0.284496736) * t + 0.254829592) * t * Math.exp(-ax * ax);
  return sign * y;
}
const normalCdf = (z: number) => 0.5 * (1 + erf(z / Math.SQRT2));

/** Cauda superior da qui-quadrado (aproximação de Wilson–Hilferty; suficiente para df ≥ 10). */
export function chiSquareSurvival(x: number, df: number): number {
  if (df <= 0 || !Number.isFinite(x)) return 1;
  const z = (Math.cbrt(x / df) - (1 - 2 / (9 * df))) / Math.sqrt(2 / (9 * df));
  return Math.min(1, Math.max(0, 1 - normalCdf(z)));
}

// ───────────────────────── Estatísticas do histórico ─────────────────────────

export interface HistoricalDraw {
  contest: number;
  date?: string | null;
  numbers: number[];
}

export interface NumberStat {
  number: number;
  count: number;
  /** % dos concursos em que saiu. */
  frequencyPct: number;
  expectedCount: number;
  /** Desvio em "desvios-padrão" em relação ao esperado ao acaso. */
  z: number;
  /** Concursos desde a última vez que saiu (0 = saiu no último concurso). */
  delay: number;
  lastContest: number | null;
  /** Intervalo médio entre aparições. */
  avgInterval: number | null;
  maxDelay: number;
  recentCount: number;
  recentExpected: number;
  recentZ: number;
  hot: boolean;
  cold: boolean;
  overdue: boolean;
}

export interface HistogramBin { from: number; to: number; count: number; pct: number }

export interface LotteryStats {
  modalidade: string;
  nome: string;
  rule: Pick<LotteryRule, 'min' | 'max' | 'draw' | 'betMin' | 'betMax'>;
  sample: { draws: number; firstContest: number | null; lastContest: number | null; firstDate: string | null; lastDate: string | null; recentWindow: number };
  perNumberProbability: number;
  numbers: NumberStat[];
  hot: NumberStat[];
  cold: NumberStat[];
  overdue: NumberStat[];
  mostFrequent: NumberStat[];
  leastFrequent: NumberStat[];
  parity: { distribution: Array<{ odd: number; even: number; count: number; pct: number; theoreticalPct: number }>; mostCommonOdd: number | null };
  sum: { mean: number | null; stdDev: number | null; min: number | null; max: number | null; p10: number | null; p90: number | null; theoreticalMean: number; theoreticalStdDev: number; histogram: HistogramBin[] };
  consecutive: { drawsWithPairPct: number; avgPairs: number };
  repeats: { distribution: Array<{ repeated: number; count: number; pct: number }>; mostCommon: number | null; avg: number };
  groups: Array<{ label: string; from: number; to: number; avgPerDraw: number; expectedPerDraw: number }>;
  pairs: Array<{ a: number; b: number; count: number; expected: number; ratio: number }>;
  uniformity: { chiSquare: number; df: number; pValue: number; conclusion: 'consistente' | 'desvio'; explanation: string } | null;
  disclaimer: string;
}

const round = (value: number, digits = 2) => { const f = 10 ** digits; return Math.round(value * f) / f; };

function sortedDraws(draws: HistoricalDraw[]): HistoricalDraw[] {
  return [...draws].sort((a, b) => a.contest - b.contest);
}

function groupSize(r: LotteryRule): number {
  return universeSize(r) <= 31 ? 5 : 10;
}

export function theoreticalSum(r: LotteryRule, k: number = r.draw): { mean: number; stdDev: number } {
  const N = universeSize(r);
  const mean = (k * (r.min + r.max)) / 2;
  const variance = (k * (N + 1) * (N - k)) / 12;
  return { mean, stdDev: Math.sqrt(Math.max(variance, 0)) };
}

/** Distribuição teórica do nº de ímpares num jogo de k dezenas (hipergeométrica). */
export function theoreticalParity(r: LotteryRule, k: number = r.draw): number[] {
  const N = universeSize(r);
  let oddInUniverse = 0;
  for (let n = r.min; n <= r.max; n += 1) if (n % 2 === 1) oddInUniverse += 1;
  const out: number[] = [];
  for (let j = 0; j <= k; j += 1) out.push(hitProbability(N, k, oddInUniverse, j));
  return out;
}

function quantile(sortedValues: number[], q: number): number | null {
  if (sortedValues.length === 0) return null;
  const pos = (sortedValues.length - 1) * q;
  const lower = Math.floor(pos);
  const upper = Math.ceil(pos);
  const lo = sortedValues[lower] ?? 0;
  return lo + ((sortedValues[upper] ?? lo) - lo) * (pos - lower);
}

export function computeStats(r: LotteryRule, rawDraws: HistoricalDraw[], options: { recentWindow?: number; topN?: number } = {}): LotteryStats {
  const draws = sortedDraws(rawDraws.filter((draw) => draw.numbers.length > 0));
  const n = draws.length;
  const N = universeSize(r);
  const p = r.draw / N;
  const recentWindow = Math.max(5, Math.min(options.recentWindow ?? 20, Math.max(n, 5)));
  const topN = options.topN ?? 10;

  const counts = new Map<number, number>();
  const lastIndex = new Map<number, number>();
  const gaps = new Map<number, number>();
  const recentCounts = new Map<number, number>();
  for (let v = r.min; v <= r.max; v += 1) { counts.set(v, 0); recentCounts.set(v, 0); gaps.set(v, 0); }
  const previousIndex = new Map<number, number>();

  draws.forEach((draw, index) => {
    for (const value of draw.numbers) {
      if (!counts.has(value)) continue;
      counts.set(value, (counts.get(value) ?? 0) + 1);
      const prev = previousIndex.has(value) ? (previousIndex.get(value) as number) : -1;
      gaps.set(value, Math.max(gaps.get(value) ?? 0, index - prev - 1));
      previousIndex.set(value, index);
      lastIndex.set(value, index);
      if (index >= n - recentWindow) recentCounts.set(value, (recentCounts.get(value) ?? 0) + 1);
    }
  });

  const numberStats: NumberStat[] = [];
  for (let v = r.min; v <= r.max; v += 1) {
    const count = counts.get(v) ?? 0;
    const expected = n * p;
    const sd = Math.sqrt(Math.max(n * p * (1 - p), 1e-9));
    const recent = recentCounts.get(v) ?? 0;
    const recentExpected = recentWindow * p;
    const recentSd = Math.sqrt(Math.max(recentWindow * p * (1 - p), 1e-9));
    const last = lastIndex.has(v) ? (lastIndex.get(v) as number) : null;
    const delay = last === null ? n : n - 1 - last;
    const avgInterval = count > 0 ? n / count : null;
    const recentZ = n >= recentWindow ? (recent - recentExpected) / recentSd : 0;
    const expectedInterval = 1 / p;
    const maxGapSoFar = Math.max(gaps.get(v) ?? 0, delay);
    numberStats.push({
      number: v,
      count,
      frequencyPct: n > 0 ? round((count / n) * 100) : 0,
      expectedCount: round(expected),
      z: n > 0 ? round((count - expected) / sd) : 0,
      delay,
      lastContest: last === null ? null : draws[last]?.contest ?? null,
      avgInterval: avgInterval === null ? null : round(avgInterval),
      maxDelay: maxGapSoFar,
      recentCount: recent,
      recentExpected: round(recentExpected),
      recentZ: round(recentZ),
      hot: n >= recentWindow && recentZ >= 1,
      cold: n >= recentWindow && recentZ <= -1,
      overdue: n >= 10 && delay > 2 * expectedInterval,
    });
  }

  // Paridade
  const theoreticalParityDist = theoreticalParity(r);
  const parityCounts = new Array<number>(r.draw + 1).fill(0);
  const sums: number[] = [];
  let drawsWithPair = 0;
  let totalPairs = 0;
  const repeatCounts = new Map<number, number>();
  let repeatTotal = 0;
  let repeatSamples = 0;
  const gSize = groupSize(r);
  const groupTotals = new Map<number, number>();
  const pairCounts = new Map<number, number>();

  draws.forEach((draw, index) => {
    const nums = [...draw.numbers].sort((a, b) => a - b);
    const odd = nums.filter((v) => v % 2 === 1).length;
    if (odd < parityCounts.length) parityCounts[odd] = (parityCounts[odd] ?? 0) + 1;
    sums.push(nums.reduce((acc, v) => acc + v, 0));
    let pairs = 0;
    for (let i = 1; i < nums.length; i += 1) if (nums[i]! === nums[i - 1]! + 1) pairs += 1;
    if (pairs > 0) drawsWithPair += 1;
    totalPairs += pairs;
    if (index > 0) {
      const prevSet = new Set(draws[index - 1]?.numbers ?? []);
      const repeated = nums.filter((v) => prevSet.has(v)).length;
      repeatCounts.set(repeated, (repeatCounts.get(repeated) ?? 0) + 1);
      repeatTotal += repeated;
      repeatSamples += 1;
    }
    for (const v of nums) {
      const group = Math.floor((v - r.min) / gSize);
      groupTotals.set(group, (groupTotals.get(group) ?? 0) + 1);
    }
    for (let i = 0; i < nums.length; i += 1) for (let j = i + 1; j < nums.length; j += 1) {
      const key = (nums[i]! - r.min) * N + (nums[j]! - r.min);
      pairCounts.set(key, (pairCounts.get(key) ?? 0) + 1);
    }
  });

  const parityDistribution = parityCounts.map((count, odd) => ({ odd, even: r.draw - odd, count, pct: n > 0 ? round((count / n) * 100) : 0, theoreticalPct: round((theoreticalParityDist[odd] ?? 0) * 100) }));
  const mostCommonOdd = n > 0 ? parityDistribution.reduce((best, item) => (item.count > best.count ? item : best)).odd : null;

  const sortedSums = [...sums].sort((a, b) => a - b);
  const theory = theoreticalSum(r);
  const histogram: HistogramBin[] = [];
  if (sortedSums.length > 0) {
    const lo = Math.floor(theory.mean - 3 * theory.stdDev);
    const hi = Math.ceil(theory.mean + 3 * theory.stdDev);
    const bins = 12;
    const width = Math.max(1, Math.ceil((hi - lo) / bins));
    for (let b = 0; b < bins; b += 1) histogram.push({ from: lo + b * width, to: lo + (b + 1) * width - 1, count: 0, pct: 0 });
    for (const s of sortedSums) {
      const idx = Math.min(bins - 1, Math.max(0, Math.floor((s - lo) / width)));
      const bin = histogram[idx]; if (bin) bin.count += 1;
    }
    for (const bin of histogram) bin.pct = round((bin.count / sortedSums.length) * 100);
  }
  const meanSum = sums.length > 0 ? sums.reduce((a, b) => a + b, 0) / sums.length : null;
  const sdSum = meanSum === null || sums.length < 2 ? null : Math.sqrt(sums.reduce((a, b) => a + (b - meanSum) ** 2, 0) / (sums.length - 1));

  const repeatDistribution = [...repeatCounts.entries()].sort((a, b) => a[0] - b[0]).map(([repeated, count]) => ({ repeated, count, pct: round((count / Math.max(repeatSamples, 1)) * 100) }));
  const repeatMostCommon = repeatDistribution.length > 0 ? repeatDistribution.reduce((best, item) => (item.count > best.count ? item : best)).repeated : null;

  const groups: LotteryStats['groups'] = [];
  const groupCount = Math.ceil(N / gSize);
  for (let g = 0; g < groupCount; g += 1) {
    const from = r.min + g * gSize;
    const to = Math.min(r.max, from + gSize - 1);
    groups.push({ label: `${String(from).padStart(2, '0')}–${String(to).padStart(2, '0')}`, from, to, avgPerDraw: n > 0 ? round((groupTotals.get(g) ?? 0) / n) : 0, expectedPerDraw: round(((to - from + 1) / N) * r.draw) });
  }

  // Pares mais frequentes (probabilidade de um par específico num sorteio = d(d-1)/(N(N-1)))
  const pairP = (r.draw * (r.draw - 1)) / (N * (N - 1));
  const pairList = [...pairCounts.entries()].map(([key, count]) => {
    const a = Math.floor(key / N) + r.min;
    const b = (key % N) + r.min;
    const expected = n * pairP;
    return { a, b, count, expected: round(expected), ratio: expected > 0 ? round(count / expected) : 0 };
  }).sort((x, y) => y.count - x.count || x.a - y.a || x.b - y.b).slice(0, topN);

  // Uniformidade (qui-quadrado ajustado para sorteios sem reposição: variância de cada contagem = n·p·(1-p))
  let uniformity: LotteryStats['uniformity'] = null;
  if (n >= 30) {
    const expected = n * p;
    const chi = numberStats.reduce((acc, item) => acc + (item.count - expected) ** 2 / (expected * (1 - p)), 0);
    const df = N - 1;
    const pValue = chiSquareSurvival(chi, df);
    const consistent = pValue >= 0.01;
    uniformity = {
      chiSquare: round(chi),
      df,
      pValue: round(pValue, 4),
      conclusion: consistent ? 'consistente' : 'desvio',
      explanation: consistent
        ? 'A distribuição das dezenas sorteadas é compatível com um sorteio perfeitamente aleatório: as diferenças de frequência entre os números são as variações normais do acaso.'
        : 'Há um desvio maior que o esperado ao acaso nesta amostra. Em geral isso vem do tamanho/recorte da amostra; não indica que algum número seja mais provável no futuro.',
    };
  }

  const byCountDesc = [...numberStats].sort((a, b) => b.count - a.count || a.number - b.number);
  const byCountAsc = [...numberStats].sort((a, b) => a.count - b.count || a.number - b.number);
  const hotList = numberStats.filter((s) => s.hot).sort((a, b) => b.recentZ - a.recentZ || a.number - b.number).slice(0, topN);
  const coldList = numberStats.filter((s) => s.cold).sort((a, b) => a.recentZ - b.recentZ || a.number - b.number).slice(0, topN);
  const overdueList = [...numberStats].sort((a, b) => b.delay - a.delay || a.number - b.number).slice(0, topN);

  return {
    modalidade: r.modalidade,
    nome: r.nome,
    rule: { min: r.min, max: r.max, draw: r.draw, betMin: r.betMin, betMax: r.betMax },
    sample: { draws: n, firstContest: draws[0]?.contest ?? null, lastContest: draws[n - 1]?.contest ?? null, firstDate: draws[0]?.date ?? null, lastDate: draws[n - 1]?.date ?? null, recentWindow },
    perNumberProbability: p,
    numbers: numberStats,
    hot: hotList,
    cold: coldList,
    overdue: overdueList,
    mostFrequent: byCountDesc.slice(0, topN),
    leastFrequent: byCountAsc.slice(0, topN),
    parity: { distribution: parityDistribution, mostCommonOdd },
    sum: { mean: meanSum === null ? null : round(meanSum), stdDev: sdSum === null ? null : round(sdSum), min: sortedSums[0] ?? null, max: sortedSums[sortedSums.length - 1] ?? null, p10: quantile(sortedSums, 0.1), p90: quantile(sortedSums, 0.9), theoreticalMean: round(theory.mean), theoreticalStdDev: round(theory.stdDev), histogram },
    consecutive: { drawsWithPairPct: n > 0 ? round((drawsWithPair / n) * 100) : 0, avgPairs: n > 0 ? round(totalPairs / n) : 0 },
    repeats: { distribution: repeatDistribution, mostCommon: repeatMostCommon, avg: repeatSamples > 0 ? round(repeatTotal / repeatSamples) : 0 },
    groups,
    pairs: pairList,
    uniformity,
    disclaimer: STATS_DISCLAIMER,
  };
}

// ───────────────────────── Validação e análise de um jogo ─────────────────────────

export interface GameValidation { ok: boolean; numbers: number[]; errors: string[] }

export function validateGame(r: LotteryRule, input: unknown[]): GameValidation {
  const errors: string[] = [];
  const parsed = input.map((value) => Number(value));
  if (parsed.some((value) => !Number.isInteger(value))) errors.push('Use apenas números inteiros.');
  const numbers = [...new Set(parsed.filter((value) => Number.isInteger(value)))].sort((a, b) => a - b);
  if (numbers.length !== parsed.length) errors.push('Há números repetidos no jogo.');
  if (numbers.some((value) => value < r.min || value > r.max)) errors.push(`${r.nome}: use números de ${String(r.min).padStart(2, '0')} a ${String(r.max).padStart(2, '0')}.`);
  if (numbers.length < r.betMin || numbers.length > r.betMax) errors.push(r.betMin === r.betMax ? `${r.nome}: o jogo tem exatamente ${r.betMin} números.` : `${r.nome}: marque de ${r.betMin} a ${r.betMax} números.`);
  return { ok: errors.length === 0, numbers, errors };
}

export function consecutiveInfo(numbers: number[]): { pairs: number; maxRun: number } {
  const sorted = [...numbers].sort((a, b) => a - b);
  let pairs = 0;
  let run = 1;
  let maxRun = sorted.length > 0 ? 1 : 0;
  for (let i = 1; i < sorted.length; i += 1) {
    if (sorted[i]! === sorted[i - 1]! + 1) { pairs += 1; run += 1; maxRun = Math.max(maxRun, run); } else run = 1;
  }
  return { pairs, maxRun };
}

function isArithmeticSequence(numbers: number[]): boolean {
  const sorted = [...numbers].sort((a, b) => a - b);
  if (sorted.length < 4) return false;
  const step = sorted[1]! - sorted[0]!;
  if (step <= 0) return false;
  return sorted.every((value, index) => index === 0 || value - sorted[index - 1]! === step);
}

export interface GameAnalysis {
  valid: boolean;
  errors: string[];
  numbers: number[];
  size: number;
  equivalentSimpleGames: number;
  probabilities: TierProbability[];
  sum: { value: number; theoreticalMean: number; theoreticalStdDev: number; z: number; typical: boolean; historyPercentile: number | null };
  parity: { odd: number; even: number; theoreticalPct: number; historicalPct: number | null };
  consecutive: { pairs: number; maxRun: number };
  groups: Array<{ label: string; count: number }>;
  numberStats: Array<Pick<NumberStat, 'number' | 'count' | 'frequencyPct' | 'delay' | 'z' | 'recentZ' | 'hot' | 'cold' | 'overdue'>>;
  history: { draws: number; hitsDistribution: Array<{ hits: number; count: number }>; best: { hits: number; contest: number } | null; wouldHaveWonTop: number[]; exactMatches: number[] };
  notes: string[];
  disclaimer: string;
}

export function analyzeGame(r: LotteryRule, rawDraws: HistoricalDraw[], input: unknown[], stats?: LotteryStats): GameAnalysis {
  const validation = validateGame(r, input);
  const numbers = validation.numbers;
  const k = numbers.length;
  const draws = sortedDraws(rawDraws);
  const st = stats ?? computeStats(r, draws);
  const N = universeSize(r);
  const empty: GameAnalysis = {
    valid: false, errors: validation.errors, numbers, size: k, equivalentSimpleGames: 0, probabilities: [],
    sum: { value: 0, theoreticalMean: 0, theoreticalStdDev: 0, z: 0, typical: false, historyPercentile: null },
    parity: { odd: 0, even: 0, theoreticalPct: 0, historicalPct: null }, consecutive: { pairs: 0, maxRun: 0 }, groups: [], numberStats: [],
    history: { draws: draws.length, hitsDistribution: [], best: null, wouldHaveWonTop: [], exactMatches: [] }, notes: [], disclaimer: STATS_DISCLAIMER,
  };
  if (!validation.ok) return empty;

  const sumValue = numbers.reduce((a, b) => a + b, 0);
  const theory = theoreticalSum(r, k);
  const z = theory.stdDev > 0 ? (sumValue - theory.mean) / theory.stdDev : 0;
  const odd = numbers.filter((v) => v % 2 === 1).length;
  const parityTheory = theoreticalParity(r, k);
  const history = draws.map((draw) => draw.numbers.reduce((acc, v) => acc + v, 0)).sort((a, b) => a - b);
  let historyPercentile: number | null = null;
  if (k === r.draw && history.length >= 30) historyPercentile = round((history.filter((s) => s <= sumValue).length / history.length) * 100, 1);
  let historicalParityPct: number | null = null;
  if (k === r.draw && st.parity.distribution[odd]) historicalParityPct = st.parity.distribution[odd].pct;

  const gSize = groupSize(r);
  const groupLabels: Array<{ label: string; count: number }> = [];
  for (let g = 0; g < Math.ceil(N / gSize); g += 1) {
    const from = r.min + g * gSize;
    const to = Math.min(r.max, from + gSize - 1);
    groupLabels.push({ label: `${String(from).padStart(2, '0')}–${String(to).padStart(2, '0')}`, count: numbers.filter((v) => v >= from && v <= to).length });
  }

  const set = new Set(numbers);
  const hitsDist = new Map<number, number>();
  let best: { hits: number; contest: number } | null = null;
  const wouldHaveWonTop: number[] = [];
  const exact: number[] = [];
  for (const draw of draws) {
    const hits = draw.numbers.filter((v) => set.has(v)).length;
    hitsDist.set(hits, (hitsDist.get(hits) ?? 0) + 1);
    if (!best || hits > best.hits) best = { hits, contest: draw.contest };
    if (hits === r.draw) { wouldHaveWonTop.push(draw.contest); if (k === r.draw) exact.push(draw.contest); }
  }

  const numberInfo = numbers.map((v) => { const s = st.numbers.find((item) => item.number === v); return { number: v, count: s?.count ?? 0, frequencyPct: s?.frequencyPct ?? 0, delay: s?.delay ?? 0, z: s?.z ?? 0, recentZ: s?.recentZ ?? 0, hot: s?.hot ?? false, cold: s?.cold ?? false, overdue: s?.overdue ?? false }; });

  const consecutive = consecutiveInfo(numbers);
  const notes: string[] = [];
  const probs = tierProbabilities(r, k);
  const top = probs[0];
  if (top) notes.push(`Chance de acertar todas as ${r.draw} dezenas sorteadas com este jogo: 1 em ${top.oneIn.toLocaleString('pt-BR')}. Qualquer outra combinação do mesmo tamanho tem exatamente a mesma chance.`);
  if (exact.length > 0) notes.push(`Esta combinação exata já foi sorteada (concurso ${exact.join(', ')}). Isso não muda a chance de sair de novo: o sorteio não tem memória.`);
  else if (k === r.draw && draws.length > 0) notes.push(`Esta combinação nunca saiu nos ${draws.length.toLocaleString('pt-BR')} concursos analisados — o que é o esperado: na maioria das combinações possíveis, nenhuma jamais saiu.`);
  if (Math.abs(z) > 1.645) notes.push('A soma das dezenas está fora da faixa em que cai a maioria dos sorteios (90%). Possível, só menos comum.');
  if (isArithmeticSequence(numbers)) notes.push('O jogo forma uma sequência (ex.: de 5 em 5). Esse tipo de jogo é muito popular; se for premiado, o prêmio tende a ser dividido com mais ganhadores.');
  if (N > 31 && numbers.every((v) => v <= 31)) notes.push('Todos os números estão entre 1 e 31 (datas de aniversário). Esse padrão é muito comum entre apostadores; jogos assim costumam dividir o prêmio com mais gente.');
  if (consecutive.maxRun >= 4) notes.push('O jogo tem 4 ou mais números em sequência, algo raro nos sorteios.');

  return {
    valid: true, errors: [], numbers, size: k, equivalentSimpleGames: equivalentSimpleGames(r, k), probabilities: probs,
    sum: { value: sumValue, theoreticalMean: round(theory.mean), theoreticalStdDev: round(theory.stdDev), z: round(z), typical: Math.abs(z) <= 1.645, historyPercentile },
    parity: { odd, even: k - odd, theoreticalPct: round((parityTheory[odd] ?? 0) * 100), historicalPct: historicalParityPct },
    consecutive, groups: groupLabels, numberStats: numberInfo,
    history: { draws: draws.length, hitsDistribution: [...hitsDist.entries()].sort((a, b) => b[0] - a[0]).map(([hits, count]) => ({ hits, count })), best, wouldHaveWonTop, exactMatches: exact },
    notes, disclaimer: STATS_DISCLAIMER,
  };
}

// ───────────────────────── Sugestão de jogos ─────────────────────────

export type SuggestionStrategy = 'equilibrado' | 'quentes' | 'atrasados' | 'misto' | 'aleatorio';

export interface SuggestedGame {
  numbers: number[];
  sum: number;
  odd: number;
  even: number;
  consecutivePairs: number;
  reasons: string[];
  relaxed: boolean;
}

export interface SuggestionOptions {
  games?: number;
  size?: number;
  strategy?: SuggestionStrategy;
  /** Números que o apostador quer obrigatoriamente no jogo. */
  fixed?: number[];
  /** Números a evitar. */
  exclude?: number[];
  seed?: number;
}

function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function weightedSample(pool: number[], weights: Map<number, number>, count: number, rnd: () => number): number[] {
  const keyed = pool.map((value) => {
    const w = Math.max(weights.get(value) ?? 1, 1e-6);
    return { value, key: Math.pow(Math.max(rnd(), 1e-12), 1 / w) };
  });
  keyed.sort((a, b) => b.key - a.key);
  return keyed.slice(0, count).map((item) => item.value);
}

export function suggestGames(r: LotteryRule, rawDraws: HistoricalDraw[], options: SuggestionOptions = {}, stats?: LotteryStats): { games: SuggestedGame[]; strategy: SuggestionStrategy; size: number; criteria: string[]; disclaimer: string } {
  const size = Math.min(Math.max(options.size ?? r.betMin, r.betMin), r.betMax);
  const gamesWanted = Math.min(Math.max(options.games ?? 3, 1), 20);
  const strategy: SuggestionStrategy = options.strategy ?? 'equilibrado';
  const st = stats ?? computeStats(r, rawDraws);
  const rnd = mulberry32(options.seed ?? Math.floor(Math.random() * 2 ** 31));
  const N = universeSize(r);
  const exclude = new Set((options.exclude ?? []).filter((v) => v >= r.min && v <= r.max));
  const fixed = [...new Set((options.fixed ?? []).filter((v) => Number.isInteger(v) && v >= r.min && v <= r.max && !exclude.has(v)))].slice(0, size);
  const pool: number[] = [];
  for (let v = r.min; v <= r.max; v += 1) if (!exclude.has(v) && !fixed.includes(v)) pool.push(v);

  const weights = new Map<number, number>();
  const hasHistory = st.sample.draws >= 20;
  for (const s of st.numbers) {
    let w = 1;
    if (hasHistory) {
      if (strategy === 'quentes') w = Math.exp(0.35 * s.recentZ);
      else if (strategy === 'atrasados') w = 1 + s.delay / Math.max(s.avgInterval ?? N / r.draw, 1);
      else if (strategy === 'misto') w = Math.exp(0.2 * s.recentZ) * (1 + 0.5 * (s.delay / Math.max(s.avgInterval ?? N / r.draw, 1)));
    }
    weights.set(s.number, w);
  }

  const theory = theoreticalSum(r, size);
  const parityProbs = theoreticalParity(r, size);
  const acceptableOdd = new Set(parityProbs.map((prob, odd) => ({ prob, odd })).filter((item) => item.prob >= 0.05).map((item) => item.odd));
  if (acceptableOdd.size === 0) parityProbs.forEach((_, odd) => acceptableOdd.add(odd));
  const gSize = groupSize(r);
  const needGroups = Math.min(3, Math.ceil(size / 4), Math.ceil(N / gSize));
  const maxRunAllowed = size >= 12 ? 4 : 3;
  const maxPairsAllowed = Math.ceil(size / 3);
  const needHigh = N > 31 && size >= 4 ? Math.max(1, Math.floor(size / 4)) : 0;

  const check = (numbers: number[]): string[] | null => {
    if (strategy === 'aleatorio') return [];
    const sum = numbers.reduce((a, b) => a + b, 0);
    if (Math.abs(sum - theory.mean) > 1.645 * theory.stdDev) return null;
    const odd = numbers.filter((v) => v % 2 === 1).length;
    if (!acceptableOdd.has(odd)) return null;
    const c = consecutiveInfo(numbers);
    if (c.maxRun > maxRunAllowed || c.pairs > maxPairsAllowed) return null;
    const groupsUsed = new Set(numbers.map((v) => Math.floor((v - r.min) / gSize)));
    if (groupsUsed.size < needGroups) return null;
    const counts = new Map<number, number>();
    for (const v of numbers) { const g = Math.floor((v - r.min) / gSize); counts.set(g, (counts.get(g) ?? 0) + 1); }
    if (Math.max(...counts.values()) > Math.ceil(size * 0.7) && size > 4) return null;
    if (needHigh > 0 && numbers.filter((v) => v > 31).length < needHigh) return null;
    if (isArithmeticSequence(numbers)) return null;
    return [];
  };

  const describe = (numbers: number[], relaxed: boolean): SuggestedGame => {
    const sum = numbers.reduce((a, b) => a + b, 0);
    const odd = numbers.filter((v) => v % 2 === 1).length;
    const c = consecutiveInfo(numbers);
    const reasons: string[] = [];
    if (strategy !== 'aleatorio' && !relaxed) {
      reasons.push(`${odd} ímpar${odd === 1 ? '' : 'es'} e ${numbers.length - odd} par${numbers.length - odd === 1 ? '' : 'es'} (distribuição comum nos sorteios)`);
      reasons.push(`soma ${sum}, dentro da faixa em que cai 90% dos jogos (${Math.round(theory.mean - 1.645 * theory.stdDev)} a ${Math.round(theory.mean + 1.645 * theory.stdDev)})`);
      if (needHigh > 0) reasons.push('inclui números acima de 31, menos escolhidos por quem joga datas — se premiar, tende a dividir com menos gente');
      reasons.push('espalhado por várias faixas, sem sequência longa nem padrão geométrico');
    }
    if (strategy === 'quentes') reasons.push('pesos maiores para dezenas que saíram acima do esperado nos últimos concursos');
    if (strategy === 'atrasados') reasons.push('pesos maiores para dezenas que estão há mais tempo sem sair');
    if (strategy === 'misto') reasons.push('mistura de dezenas recentes e atrasadas');
    return { numbers, sum, odd, even: numbers.length - odd, consecutivePairs: c.pairs, reasons, relaxed };
  };

  const results: SuggestedGame[] = [];
  const seen = new Set<string>();
  let attempts = 0;
  const maxAttempts = 6000 * gamesWanted;
  let fallback: number[] | null = null;
  while (results.length < gamesWanted && attempts < maxAttempts) {
    attempts += 1;
    const picked = [...fixed, ...weightedSample(pool, weights, size - fixed.length, rnd)].sort((a, b) => a - b);
    const key = picked.join(',');
    if (seen.has(key)) continue;
    fallback = picked;
    if (check(picked) === null) continue;
    seen.add(key);
    results.push(describe(picked, false));
  }
  let relaxedTries = 0;
  while (results.length < gamesWanted && fallback && relaxedTries < 5000) {
    relaxedTries += 1;
    const picked = [...fixed, ...weightedSample(pool, weights, size - fixed.length, rnd)].sort((a, b) => a - b);
    const key = picked.join(',');
    if (seen.has(key)) continue;
    seen.add(key);
    results.push(describe(picked, true));
  }

  const criteria = strategy === 'aleatorio'
    ? ['Sorteio totalmente aleatório entre todos os números permitidos.']
    : [
        'Soma das dezenas dentro da faixa central teórica (90% dos jogos).',
        'Mistura de pares e ímpares comum nos sorteios.',
        'Sem sequências longas e sem padrões geométricos (ex.: de 5 em 5).',
        'Dezenas espalhadas por várias faixas do volante.',
        ...(needHigh > 0 ? ['Inclui números acima de 31 para fugir de datas de aniversário (reduz a chance de dividir o prêmio).'] : []),
        ...(strategy !== 'equilibrado' && hasHistory ? [`Ponderação "${strategy}" com base nos últimos ${st.sample.recentWindow} concursos.`] : []),
      ];
  return { games: results, strategy, size, criteria, disclaimer: STATS_DISCLAIMER };
}

// ───────────────────────── Leitura do histórico (CAIXA) ─────────────────────────

export interface ParsedDraw {
  contest: number;
  date: Date;
  numbers: number[];
  secondDrawNumbers: number[];
}

function toDezenas(values: string[] | undefined): number[] {
  return (values ?? []).map((value) => Number(String(value).trim())).filter((value) => Number.isInteger(value) && value >= 0).sort((a, b) => a - b);
}

/**
 * Converte a resposta da CAIXA de um concurso APURADO em dezenas ordenadas. Retorna null se a resposta não bater com as
 * regras da modalidade (número do concurso diferente do pedido, quantidade de dezenas errada ou dezenas fora do universo).
 */
export function parseHistoricalDraw(rule: LotteryRule, payload: CaixaContestPayload, expectedContest?: number): ParsedDraw | null {
  if (!payload.numero || (expectedContest !== undefined && payload.numero !== expectedContest)) return null;
  const date = parseCaixaDate(payload.dataApuracao);
  if (!date) return null;
  const numbers = toDezenas(payload.listaDezenas && payload.listaDezenas.length > 0 ? payload.listaDezenas : payload.dezenasSorteadasOrdemSorteio);
  const inUniverse = (list: number[]) => list.length === rule.draw && new Set(list).size === list.length && list.every((value) => value >= rule.min && value <= rule.max);
  if (!inUniverse(numbers)) return null;
  const second = rule.secondDraw ? toDezenas(payload.listaDezenasSegundoSorteio) : [];
  if (rule.secondDraw && second.length > 0 && !inUniverse(second)) return null;
  return { contest: payload.numero, date, numbers, secondDrawNumbers: second };
}
