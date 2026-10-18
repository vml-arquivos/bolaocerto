export type NumberStat = {
  number: number; count: number; frequencyPct: number; expectedCount: number; z: number; delay: number; lastContest: number | null;
  avgInterval: number | null; maxDelay: number; recentCount: number; recentExpected: number; recentZ: number; hot: boolean; cold: boolean; overdue: boolean;
};
export type TierProbability = { hits: number; label: string; probability: number; oneIn: number; percent: number };
export type StatsOverviewItem = {
  modalidade: string; nome: string; concursosNaBase: number; ultimoConcurso: number | null; ultimaData: string | null; ultimasDezenas: number[];
  universo: { min: number; max: number }; dezenasSorteadas: number; jogoMinimo: number; jogoMaximo: number; chancePremioMaximo: { umEm: number; rotulo: string };
};
export type StatsOverview = { modalidades: StatsOverviewItem[]; aviso: string };
export type Probabilities = {
  modalidade: string; nome: string; dezenas: number; jogosSimplesEquivalentes: number; faixas: TierProbability[];
  porTamanho: Array<{ dezenas: number; jogosSimplesEquivalentes: number; premioMaximo: TierProbability }>; explicacao: string; aviso: string;
};
export type LotteryStats = {
  modalidade: string; nome: string; rule: { min: number; max: number; draw: number; betMin: number; betMax: number };
  sample: { draws: number; firstContest: number | null; lastContest: number | null; firstDate: string | null; lastDate: string | null; recentWindow: number };
  perNumberProbability: number; numbers: NumberStat[]; hot: NumberStat[]; cold: NumberStat[]; overdue: NumberStat[]; mostFrequent: NumberStat[]; leastFrequent: NumberStat[];
  parity: { distribution: Array<{ odd: number; even: number; count: number; pct: number; theoreticalPct: number }>; mostCommonOdd: number | null };
  sum: { mean: number | null; stdDev: number | null; min: number | null; max: number | null; p10: number | null; p90: number | null; theoreticalMean: number; theoreticalStdDev: number; histogram: Array<{ from: number; to: number; count: number; pct: number }> };
  consecutive: { drawsWithPairPct: number; avgPairs: number };
  repeats: { distribution: Array<{ repeated: number; count: number; pct: number }>; mostCommon: number | null; avg: number };
  groups: Array<{ label: string; from: number; to: number; avgPerDraw: number; expectedPerDraw: number }>;
  pairs: Array<{ a: number; b: number; count: number; expected: number; ratio: number }>;
  uniformity: { chiSquare: number; df: number; pValue: number; conclusion: 'consistente' | 'desvio'; explanation: string } | null;
  disclaimer: string;
  concursosNaBase: number;
  ultimosResultados: Array<{ concurso: number; data: string; acumulado: boolean; dezenas: number[]; segundoSorteio: number[] }>;
  proximoConcurso: { concurso: number; data: string; premioEstimado: number | null; acumulado: boolean } | null;
  probabilidades: Probabilities;
};
export type GameAnalysis = {
  modalidade: string; nome: string; valid: boolean; numbers: number[]; size: number; equivalentSimpleGames: number; probabilities: TierProbability[];
  sum: { value: number; theoreticalMean: number; theoreticalStdDev: number; z: number; typical: boolean; historyPercentile: number | null };
  parity: { odd: number; even: number; theoreticalPct: number; historicalPct: number | null };
  consecutive: { pairs: number; maxRun: number }; groups: Array<{ label: string; count: number }>;
  numberStats: Array<Pick<NumberStat, 'number' | 'count' | 'frequencyPct' | 'delay' | 'z' | 'recentZ' | 'hot' | 'cold' | 'overdue'>>;
  history: { draws: number; hitsDistribution: Array<{ hits: number; count: number }>; best: { hits: number; contest: number } | null; wouldHaveWonTop: number[]; exactMatches: number[] };
  notes: string[]; disclaimer: string;
};
export type SuggestedGame = { numbers: number[]; sum: number; odd: number; even: number; consecutivePairs: number; reasons: string[]; relaxed: boolean };
export type Suggestions = { modalidade: string; nome: string; baseHistorica: number; games: SuggestedGame[]; strategy: string; size: number; criteria: string[]; disclaimer: string };

export const fmtInt = (value: number) => new Intl.NumberFormat('pt-BR').format(value);
export const pad = (value: number) => String(value).padStart(2, '0');
export function fmtPercent(percent: number): string {
  if (percent === 0) return '0%';
  if (percent >= 1) return `${new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 }).format(percent)}%`;
  return `${new Intl.NumberFormat('pt-BR', { maximumSignificantDigits: 2, maximumFractionDigits: 8 }).format(percent)}%`;
}
export function fmtDate(value: string | null | undefined): string {
  if (!value) return '—';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' }).format(new Date(value));
}
