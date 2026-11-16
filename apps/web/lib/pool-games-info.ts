import type { PublicPool } from './domain';

/**
 * Quantos jogos o bolão tem e quantos números tem cada jogo, para mostrar no cartão da página principal.
 * Usa os jogos já definidos; se os números ainda vão ser escolhidos, usa o que foi previsto na precificação.
 */
export function poolGamesInfo(pool: Pick<PublicPool, 'jogos' | 'numerosApostados' | 'precificacao'>): { jogos: number; numeros: string; texto: string } | null {
  const games = pool.jogos ?? [];
  const sizes = games.length ? games.map((game) => (game as { quantidadeDezenas?: number }).quantidadeDezenas || game.numeros.length).filter((n) => n > 0) : pool.numerosApostados?.length ? [pool.numerosApostados.length] : [];
  let count = games.length || (pool.numerosApostados?.length ? 1 : 0);
  if (!count && pool.precificacao?.jogosPrevistos) count = pool.precificacao.jogosPrevistos;
  if (!sizes.length && pool.precificacao?.dezenasPrevistas) sizes.push(pool.precificacao.dezenasPrevistas);
  if (!count || !sizes.length) return null;
  const min = Math.min(...sizes); const max = Math.max(...sizes);
  const numeros = min === max ? `${min} números${count > 1 ? ' cada' : ''}` : `de ${min} a ${max} números`;
  const jogos = `${count} ${count === 1 ? 'jogo' : 'jogos'}`;
  return { jogos: count, numeros, texto: `${jogos} · ${numeros}` };
}
