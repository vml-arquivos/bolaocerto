import { countHits, getLotteryRule, parseTierHits, SettlementTier } from '@bolaocerto/shared-types';

export const MAX_GAMES_PER_CHECK = 20;

export interface CheckedGame {
  ordem: number;
  numeros: number[];
  erro?: string;
  acertos?: number;
  numerosAcertados?: number[];
  /** Resultado do 2º sorteio (Dupla Sena). */
  acertosSegundoSorteio?: number;
  numerosAcertadosSegundo?: number[];
  premia?: boolean;
  faixa?: string | null;
  /** Valor pago por ganhador naquela faixa, quando a CAIXA já divulgou o rateio. */
  valorFaixa?: number | null;
  ganhadoresFaixa?: number | null;
}

/** Compara jogos digitados pela pessoa com o resultado oficial. Não calcula prêmio de bolão: só acertos e a faixa oficial. */
export function conferirJogos(modalidade: string, jogos: number[][], drawn: number[], secondDraw: number[], tiers: SettlementTier[]): CheckedGame[] {
  const rule = getLotteryRule(modalidade);
  if (!rule) throw new Error('Modalidade sem conferência de dezenas.');
  const parsed = tiers.map((tier) => ({ tier, parsed: parseTierHits(tier.descricaoFaixa) })).filter((entry) => entry.parsed !== null);
  const hasSecondTiers = parsed.some((entry) => entry.parsed?.segundoSorteio);
  const tierFor = (hits: number, second: boolean) => parsed.find((entry) => entry.parsed!.acertos === hits && (hasSecondTiers ? entry.parsed!.segundoSorteio === second : true))?.tier;
  return jogos.slice(0, MAX_GAMES_PER_CHECK).map((numeros, index): CheckedGame => {
    const ordem = index + 1;
    const sorted = [...numeros].sort((a, b) => a - b);
    const invalid = (erro: string): CheckedGame => ({ ordem, numeros: sorted, erro });
    if (!numeros.every((n) => typeof n === 'number' && Number.isInteger(n))) return invalid('Use só números inteiros.');
    if (new Set(numeros).size !== numeros.length) return invalid('Tem número repetido.');
    if (numeros.some((n) => n < rule.min || n > rule.max)) return invalid(`Os números vão de ${rule.min} a ${rule.max}.`);
    if (numeros.length < rule.betMin || numeros.length > rule.betMax) return invalid(rule.betMin === rule.betMax ? `Use ${rule.betMin} números.` : `Use de ${rule.betMin} a ${rule.betMax} números.`);
    const hits = countHits(numeros, drawn);
    const set = new Set(drawn);
    const second = secondDraw.length ? countHits(numeros, secondDraw) : null;
    const pickBest = hits >= (second ?? -1) ? { hits, isSecond: false } : { hits: second as number, isSecond: true };
    const premia = rule.tiers.includes(hits) || (second !== null && rule.tiers.includes(second));
    const bestPays = rule.tiers.includes(pickBest.hits) ? pickBest : (second !== null && rule.tiers.includes(second) ? { hits: second, isSecond: true } : pickBest);
    const tier = premia ? tierFor(bestPays.hits, bestPays.isSecond) : undefined;
    const winners = tier ? Number(tier.numeroDeGanhadores ?? 0) : 0;
    const value = tier ? Number(tier.valorPremio ?? 0) : 0;
    const secondSet = new Set(secondDraw);
    return {
      ordem,
      numeros: sorted,
      acertos: hits,
      numerosAcertados: sorted.filter((n) => set.has(n)),
      ...(second !== null ? { acertosSegundoSorteio: second, numerosAcertadosSegundo: sorted.filter((n) => secondSet.has(n)) } : {}),
      premia,
      faixa: premia ? (rule.tierNames[bestPays.hits] ?? `${bestPays.hits} acertos`) : null,
      valorFaixa: premia && winners > 0 && value > 0 ? value : null,
      ganhadoresFaixa: premia && tier ? winners : null,
    };
  });
}
