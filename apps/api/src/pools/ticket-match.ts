import { BadRequestException } from '@nestjs/common';

/** Modalidades em que a ordem dos números importa (colunas / jogos da Loteca). */
const ORDERED = new Set(['supersete', 'loteca']);

const label = (numbers: number[]) => numbers.map((n) => String(n).padStart(2, '0')).join(' ');

/**
 * Confere os jogos digitados a partir do comprovante com os jogos do bolão.
 * Tudo precisa bater: mesma quantidade de jogos e mesmos números em cada um (a ordem dos jogos não importa).
 */
export function assertTicketMatchesPool(
  games: Array<{ ordem: number; numeros: number[] }>,
  informed: number[][] | undefined,
  modality?: string | null,
): void {
  if (!informed?.length) throw new BadRequestException('Digite os números que estão no comprovante para conferir com o bolão antes de registrar.');
  const ordered = ORDERED.has(String(modality ?? ''));
  const clean = informed.map((game) => game.map(Number));
  if (clean.some((game) => !game.length || game.some((n) => !Number.isInteger(n) || n < 0))) throw new BadRequestException('Há número inválido nos jogos do comprovante.');
  const key = (numbers: number[]) => (ordered ? numbers : [...numbers].sort((a, b) => a - b)).join('-');

  const pending = games.map((game) => ({ ordem: game.ordem, numeros: game.numeros, key: key(game.numeros) }));
  const unknown: number[][] = [];
  for (const game of clean) {
    const index = pending.findIndex((item) => item.key === key(game));
    if (index === -1) unknown.push(game); else pending.splice(index, 1);
  }
  if (!unknown.length && !pending.length) return;

  const parts: string[] = [];
  if (unknown.length) parts.push(`no comprovante e fora do bolão: ${unknown.map((game) => `[${label(game)}]`).join(', ')}`);
  if (pending.length) parts.push(`no bolão e fora do comprovante: ${pending.map((item) => `jogo ${item.ordem} [${label(item.numeros)}]`).join(', ')}`);
  throw new BadRequestException(`O comprovante não bate com os jogos do bolão (${parts.join('; ')}). Corrija antes de registrar: o comprovante precisa ter exatamente os números do bolão.`);
}
