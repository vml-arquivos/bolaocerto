/**
 * Apuração de bolões: confere cada jogo com o resultado oficial e divide o prêmio entre as cotas.
 * Funções puras (sem banco), usadas pelo worker e cobertas por testes.
 *
 * Valores em REAIS brutos, como informados pela CAIXA (antes de qualquer imposto retido pela CAIXA no pagamento).
 */

export interface SettlementTier { descricaoFaixa?: string; numeroDeGanhadores?: number; valorPremio?: number }
export interface SettlementGameInput { ordem: number; numeros: number[]; /** Time do Coração (Timemania) ou Mês de Sorte (Dia de Sorte, 1–12) escolhidos no jogo. */ selecao?: { timeCoracao?: string; mesSorte?: number } | null }
export interface SettlementPrize { faixa: string; sorteio: 1 | 2; acertos: number; valor: number }
export interface SettlementGameResult { ordem: number; numeros: number[]; acertos: number; acertosSegundoSorteio: number | null; premios: SettlementPrize[]; total: number }
export interface SettlementResult { jogos: SettlementGameResult[]; premioTotal: number; teveGanhador: boolean; melhorFaixa: string | null; /** Preenchido quando a faixa do Time do Coração / Mês de Sorte tem ganhadores e não deu para conferi-la com segurança. */ faixaEspecialNaoConferida?: string }

/** Modalidades em que "acertos" = quantas dezenas do jogo saíram. Super Sete (colunas) e +Milionária (trevos) exigem conferência manual. */
export const AUTO_SETTLEMENT_MODALITIES: readonly string[] = ['megasena', 'lotofacil', 'quina', 'lotomania', 'duplasena', 'timemania', 'diadesorte'];
export const supportsAutoSettlement = (modality: string): boolean => AUTO_SETTLEMENT_MODALITIES.includes(modality);

const WORD_HITS: Record<string, number> = { sena: 6, quina: 5, quadra: 4, terno: 3, duque: 2 };

/** Lê a faixa da CAIXA ("6 acertos", "Quina", "5 acertos - 2º sorteio"...). Retorna null quando a faixa não depende só de acertos (ex.: "Time do Coração"). */
export function parseTierHits(description: string | undefined): { acertos: number; segundoSorteio: boolean } | null {
  const text = (description ?? '').toLowerCase().trim();
  if (!text || /trevo/.test(text)) return null;
  const second = /2\s*[ºo°]?\s*sorteio|segundo\s+sorteio/.test(text);
  const withoutOrdinal = text.replace(/2\s*[ºo°]?\s*sorteio/g, '');
  const digits = withoutOrdinal.match(/\d+/)?.[0];
  if (digits !== undefined) return { acertos: Number(digits), segundoSorteio: second };
  const word = Object.keys(WORD_HITS).find((key) => new RegExp(`\\b${key}\\b`).test(withoutOrdinal));
  return word ? { acertos: WORD_HITS[word] as number, segundoSorteio: second } : null;
}

export function countHits(numbers: readonly number[], drawn: readonly number[]): number {
  const set = new Set(drawn);
  let hits = 0;
  for (const value of new Set(numbers)) if (set.has(value)) hits += 1;
  return hits;
}

const cents = (value: number): number => Math.round(value * 100);

/** Faixas que não dependem das dezenas: Time do Coração (Timemania) e Mês de Sorte (Dia de Sorte). */
export function specialTierKind(description: string | undefined): 'time' | 'mes' | null {
  const text = plain(description ?? '');
  if (/time\s+do\s+coracao/.test(text)) return 'time';
  if (/mes\s+(da|de)\s+sorte/.test(text)) return 'mes';
  return null;
}
const MONTHS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
function plain(value: string): string { return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().trim(); }
function teamKey(value: string): string { return plain(value).replace(/\/\s*[a-z]{2}\s*$/, '').replace(/[^a-z0-9]/g, ''); }

/** sim = o jogo acertou; nao = errou com certeza; incerto = faltou dado ou os nomes não batem com clareza (nunca se adivinha). */
export function matchSpecialSelection(kind: 'time' | 'mes', selecao: SettlementGameInput['selecao'], drawn: string | undefined): 'sim' | 'nao' | 'incerto' {
  if (!drawn?.trim() || !selecao) return 'incerto';
  if (kind === 'mes') {
    const chosen = selecao.mesSorte;
    if (!Number.isInteger(chosen) || (chosen as number) < 1 || (chosen as number) > 12) return 'incerto';
    const text = plain(drawn);
    const byName = MONTHS.findIndex((month) => text === month) + 1;
    const byNumber = /^\d{1,2}$/.test(text) ? Number(text) : 0;
    const month = byName || byNumber;
    return month >= 1 && month <= 12 ? (month === chosen ? 'sim' : 'nao') : 'incerto';
  }
  const chosen = typeof selecao.timeCoracao === 'string' ? teamKey(selecao.timeCoracao) : '';
  const sorted = teamKey(drawn);
  if (chosen.length < 3 || sorted.length < 3) return 'incerto';
  if (chosen === sorted) return 'sim';
  return chosen.includes(sorted) || sorted.includes(chosen) ? 'incerto' : 'nao';
}

/** Cada jogo recebe, por faixa premiada que atingiu, o valor POR GANHADOR informado pela CAIXA. */
export function settleGames(input: { games: SettlementGameInput[]; drawn: number[]; secondDraw?: number[]; tiers: SettlementTier[]; modality?: string; drawnSpecial?: string }): SettlementResult {
  const winnable = input.tiers
    .map((tier) => ({ tier, parsed: parseTierHits(tier.descricaoFaixa) }))
    .filter((entry) => entry.parsed !== null && Number(entry.tier.numeroDeGanhadores ?? 0) > 0 && Number(entry.tier.valorPremio ?? 0) > 0);
  const hasSecondTiers = winnable.some((entry) => entry.parsed?.segundoSorteio);
  const secondDraw = input.secondDraw ?? [];
  let totalCents = 0;
  let best: { acertos: number; faixa: string } | null = null;
  // Time do Coração / Mês de Sorte: prêmio à parte, pago a quem acertou o time/mês sorteado, tenha ou não acertado dezenas.
  const specialKind = input.modality === 'timemania' ? 'time' : input.modality === 'diadesorte' ? 'mes' : null;
  const specialTier = specialKind ? input.tiers.find((tier) => specialTierKind(tier.descricaoFaixa) === specialKind && Number(tier.numeroDeGanhadores ?? 0) > 0 && Number(tier.valorPremio ?? 0) > 0) : undefined;
  let specialDoubt: string | undefined;

  const jogos = input.games.map((game): SettlementGameResult => {
    const acertos = countHits(game.numeros, input.drawn);
    const acertosSegundo = secondDraw.length ? countHits(game.numeros, secondDraw) : null;
    const premios: SettlementPrize[] = [];
    const claim = (hits: number, sorteio: 1 | 2) => {
      const match = winnable.find((entry) => entry.parsed!.acertos === hits && (hasSecondTiers ? (sorteio === 2) === entry.parsed!.segundoSorteio : sorteio === 1));
      if (!match) return;
      premios.push({ faixa: match.tier.descricaoFaixa ?? `${hits} acertos`, sorteio, acertos: hits, valor: Number(match.tier.valorPremio) });
    };
    claim(acertos, 1);
    if (specialKind && specialTier) {
      const match = matchSpecialSelection(specialKind, game.selecao, input.drawnSpecial);
      if (match === 'sim') premios.push({ faixa: specialTier.descricaoFaixa ?? (specialKind === 'time' ? 'Time do Coração' : 'Mês de Sorte'), sorteio: 1, acertos: 0, valor: Number(specialTier.valorPremio) });
      else if (match === 'incerto') specialDoubt = specialDoubt ?? (!input.drawnSpecial?.trim() ? 'o resultado não trouxe o nome sorteado' : !game.selecao ? 'o jogo não tem o time/mês guardado' : 'o nome do time/mês escolhido não bate com clareza com o sorteado');
    }
    // Dupla Sena: se a CAIXA não separa as faixas do 2º sorteio, o mesmo quadro de prêmios vale para ele.
    if (acertosSegundo !== null) {
      if (hasSecondTiers) claim(acertosSegundo, 2);
      else { const match = winnable.find((entry) => entry.parsed!.acertos === acertosSegundo); if (match) premios.push({ faixa: match.tier.descricaoFaixa ?? `${acertosSegundo} acertos`, sorteio: 2, acertos: acertosSegundo, valor: Number(match.tier.valorPremio) }); }
    }
    const total = premios.reduce((sum, prize) => sum + cents(prize.valor), 0);
    totalCents += total;
    for (const prize of premios) if (!best || prize.acertos > best.acertos) best = { acertos: prize.acertos, faixa: prize.faixa };
    return { ordem: game.ordem, numeros: game.numeros, acertos, acertosSegundoSorteio: acertosSegundo, premios, total: total / 100 };
  });

  return { jogos, premioTotal: totalCents / 100, teveGanhador: totalCents > 0, melhorFaixa: best ? (best as { faixa: string }).faixa : null, ...(specialDoubt ? { faixaEspecialNaoConferida: specialDoubt } : {}) };
}

/**
 * Divide o prêmio (em reais) entre as cotas, proporcional à quantidade, em centavos exatos:
 * a soma das partes é SEMPRE igual ao total (sobras de centavos vão para as maiores frações, de forma determinística).
 */
export function splitPrize(total: number, shares: Array<{ id: string; quantidade: number }>): Map<string, number> {
  const out = new Map<string, number>();
  const units = shares.reduce((sum, share) => sum + Math.max(0, share.quantidade), 0);
  const totalCents = cents(total);
  if (units <= 0 || totalCents <= 0) { for (const share of shares) out.set(share.id, 0); return out; }
  const parts = shares.map((share) => {
    const exact = (totalCents * Math.max(0, share.quantidade)) / units;
    return { id: share.id, base: Math.floor(exact), frac: exact - Math.floor(exact) };
  });
  let remainder = totalCents - parts.reduce((sum, part) => sum + part.base, 0);
  const order = [...parts].sort((a, b) => b.frac - a.frac || (a.id < b.id ? -1 : 1));
  for (const part of order) { if (remainder <= 0) break; part.base += 1; remainder -= 1; }
  for (const part of parts) out.set(part.id, part.base / 100);
  return out;
}
