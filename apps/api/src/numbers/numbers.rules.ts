/** Regras de cada jogo para o banco de números: faixa de dezenas e quantas dá para marcar. */
export const BANK_RULES: Record<string, { max: number; min: number; limit: number }> = {
  megasena: { max: 60, min: 6, limit: 20 },
  lotofacil: { max: 25, min: 15, limit: 20 },
  quina: { max: 80, min: 5, limit: 15 },
  duplasena: { max: 50, min: 6, limit: 15 },
  lotomania: { max: 100, min: 50, limit: 50 },
};
export const BANK_MODALITIES = Object.keys(BANK_RULES);
export const MAX_BANK_BATCH = 100;

/** Chave única do jogo: mesma modalidade + mesmas dezenas (em qualquer ordem) = mesmo jogo. */
export function gameKey(modalidade: string, numeros: number[]): string {
  return `${modalidade}:${[...numeros].sort((a, b) => a - b).join('-')}`;
}

/** Lê texto livre ("04 12 23 35", uma linha por jogo) e devolve os jogos já validados para a modalidade. */
export function parseGames(modalidade: string, text: string): { jogos: number[][]; erros: string[] } {
  const rule = BANK_RULES[modalidade];
  if (!rule) return { jogos: [], erros: ['Modalidade não aceita no banco de números.'] };
  const jogos: number[][] = [];
  const erros: string[] = [];
  const seen = new Set<string>();
  text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean).forEach((line, index) => {
    const parts = line.split(/[\s,;.-]+/).filter(Boolean);
    const nums = parts.map((part) => (/^\d{1,3}$/.test(part) ? Number(part) : NaN));
    const label = `Linha ${index + 1}`;
    if (nums.some((n) => !Number.isInteger(n))) { erros.push(`${label}: use só números separados por espaço ou vírgula.`); return; }
    if (nums.some((n) => n < 1 || n > rule.max)) { erros.push(`${label}: os números vão de 1 a ${rule.max}.`); return; }
    if (new Set(nums).size !== nums.length) { erros.push(`${label}: tem número repetido.`); return; }
    if (nums.length < rule.min || nums.length > rule.limit) { erros.push(`${label}: use de ${rule.min} a ${rule.limit} números (veio ${nums.length}).`); return; }
    const key = gameKey(modalidade, nums);
    if (seen.has(key)) return;
    seen.add(key);
    jogos.push([...nums].sort((a, b) => a - b));
  });
  return { jogos, erros };
}
