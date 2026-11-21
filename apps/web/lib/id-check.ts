/* Conferência automática do documento de identidade: qualidade da foto e dados encontrados no texto lido. Só regras puras (testáveis). */

export type IdExpected = { nome: string; cpf: string; rg: string; nascimento: string };
export type IdFound = { nome: boolean | null; cpf: boolean | null; rg: boolean | null; nascimento: boolean | null };
export type IdReading = { automatica: boolean; legivel: boolean | null; motivo: string | null; largura: number | null; altura: number | null; nitidez: number | null; brilho: number | null; confianca: number | null; achou: IdFound };

export const EMPTY_FOUND: IdFound = { nome: null, cpf: null, rg: null, nascimento: null };
const NAME_STOP = new Set(['DA', 'DE', 'DO', 'DAS', 'DOS', 'E']);
const LOOKALIKE: Record<string, string> = { O: '0', Q: '0', D: '0', I: '1', L: '1', '|': '1', Z: '2', S: '5', B: '8', G: '6', T: '7' };

export function normalizeText(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toUpperCase().replace(/[^A-Z0-9\s/.\-|]/g, ' ').replace(/\s+/g, ' ').trim();
}

/** Todos os dígitos do texto, trocando letras parecidas com números (O→0, I→1, S→5…) só nas palavras que já são quase todas números. */
export function digitStream(text: string): string {
  return normalizeText(text).split(' ').map((token) => {
    const real = (token.match(/\d/g) ?? []).length;
    if (!real) return '';
    const letters = (token.match(/[A-Z|]/g) ?? []).length;
    const convertible = (token.match(/[OQDILZSBGT|]/g) ?? []).length;
    const fixed = letters && letters === convertible && letters <= Math.max(1, Math.ceil(real / 3)) ? token.replace(/[A-Z|]/g, (c) => LOOKALIKE[c] ?? c) : token;
    return fixed.replace(/\D/g, '');
  }).join('');
}

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 1) return 2;
  const prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i += 1) {
    let diag = prev[0]!; prev[0] = i;
    for (let j = 1; j <= b.length; j += 1) {
      const temp = prev[j]!;
      prev[j] = Math.min(prev[j]! + 1, prev[j - 1]! + 1, diag + (a[i - 1] === b[j - 1] ? 0 : 1));
      diag = temp;
    }
  }
  return prev[b.length]!;
}

/** Quantas partes do nome aparecem no texto (aceita 1 letra errada nas partes com 5 letras ou mais). */
export function nameMatch(text: string, name: string): { found: number; total: number; ok: boolean } {
  const parts = normalizeText(name).split(' ').filter((part) => part.length >= 2 && !NAME_STOP.has(part));
  const words = new Set(normalizeText(text).split(/[\s/.\-|]+/).filter((word) => word.length >= 2));
  let found = 0;
  for (const part of parts) {
    if (words.has(part)) { found += 1; continue; }
    if (part.length >= 5 && [...words].some((word) => distance(word, part) <= 1)) found += 1;
  }
  const total = parts.length;
  const need = total <= 2 ? total : Math.max(2, Math.ceil(total * 0.6));
  return { found, total, ok: total > 0 && found >= need };
}

/** Procura nome, CPF, RG e data de nascimento no texto lido do documento. */
export function findInText(text: string, expected: IdExpected): IdFound {
  const digits = digitStream(text);
  const cpf = expected.cpf.replace(/\D/g, '');
  const rg = expected.rg.replace(/\D/g, '');
  const [y, m, d] = expected.nascimento.split('-');
  return {
    nome: expected.nome ? nameMatch(text, expected.nome).ok : null,
    cpf: cpf.length === 11 ? digits.includes(cpf) : null,
    rg: rg.length >= 4 ? digits.includes(rg) : null,
    nascimento: y && m && d ? digits.includes(`${d}${m}${y}`) : null,
  };
}

/** Brilho médio e nitidez (variância do Laplaciano) de uma imagem em tons de cinza. */
export function imageStats(gray: ArrayLike<number>, width: number, height: number): { brilho: number; nitidez: number } {
  let sum = 0;
  for (let i = 0; i < gray.length; i += 1) sum += gray[i]!;
  const brilho = gray.length ? sum / gray.length : 0;
  let count = 0; let mean = 0; let m2 = 0;
  for (let y = 1; y < height - 1; y += 1) {
    for (let x = 1; x < width - 1; x += 1) {
      const i = y * width + x;
      const lap = gray[i - width]! + gray[i + width]! + gray[i - 1]! + gray[i + 1]! - 4 * gray[i]!;
      count += 1;
      const delta = lap - mean; mean += delta / count; m2 += delta * (lap - mean);
    }
  }
  return { brilho: Math.round(brilho), nitidez: count ? Math.round(m2 / count) : 0 };
}

/** A foto tem chance de ser lida? (tamanho, luz e foco). */
export function qualityVerdict(input: { largura: number; altura: number; brilho: number; nitidez: number }): { ok: boolean; motivo: string | null } {
  if (Math.min(input.largura, input.altura) < 480) return { ok: false, motivo: 'Foto pequena demais. Chegue mais perto do documento.' };
  if (input.brilho < 45) return { ok: false, motivo: 'Foto escura. Procure um lugar com mais luz.' };
  if (input.brilho > 230) return { ok: false, motivo: 'Foto clara demais ou com reflexo. Evite o flash e a luz direta.' };
  if (input.nitidez < 35) return { ok: false, motivo: 'Foto tremida ou fora de foco. Apoie o celular e tente de novo.' };
  return { ok: true, motivo: null };
}

/** Resultado final de um lado: legível se a foto é boa e a leitura encontrou o suficiente. */
export function finalReading(input: { largura: number; altura: number; brilho: number; nitidez: number; confianca: number | null; achou: IdFound; ocr: boolean }): IdReading {
  const quality = qualityVerdict(input);
  const hits = Object.values(input.achou).filter((value) => value === true).length;
  const readable = quality.ok && (!input.ocr || (input.confianca ?? 0) >= 45 || hits >= 2);
  const motivo = !quality.ok ? quality.motivo : !readable ? 'Não conseguimos ler o documento. Tire outra foto, de frente, sem reflexo e com o documento inteiro.' : null;
  return { automatica: true, legivel: readable, motivo, largura: input.largura, altura: input.altura, nitidez: input.nitidez, brilho: input.brilho, confianca: input.confianca, achou: input.achou };
}

export function manualReading(motivo: string): IdReading {
  return { automatica: false, legivel: null, motivo, largura: null, altura: null, nitidez: null, brilho: null, confianca: null, achou: { ...EMPTY_FOUND } };
}
