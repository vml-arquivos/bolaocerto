const two = (n: number) => String(n).padStart(2, '0');

type Game = { ordem: number; numeros: number[] };

/**
 * Resultado de um bolão nos painéis: números sorteados e, embaixo, cada jogo do bolão com um X vermelho
 * em cima de cada número acertado e quantos acertos o jogo teve. Com muitos jogos, mostra primeiro os que mais acertaram.
 */
export function PoolGamesResult({ drawn, second = [], games, maxGames = 6, moreHref }: { drawn: number[]; second?: number[]; games: Game[]; maxGames?: number; moreHref?: string }) {
  if (!drawn.length) return null;
  const hits = new Set([...drawn, ...second]);
  const scored = games.map((game) => ({ ...game, acertos: game.numeros.filter((n) => hits.has(n)).length }));
  const shown = scored.length > maxGames ? [...scored].sort((a, b) => b.acertos - a.acertos || a.ordem - b.ordem).slice(0, maxGames) : scored;
  const best = scored.reduce((max, game) => Math.max(max, game.acertos), 0);
  return <div className="pgr">
    <div className="pgr-drawn">
      <small>Sorteados</small>
      <span className="pgr-balls">{drawn.map((n, i) => <span className="apr-ball" key={`${n}-${i}`}>{two(n)}</span>)}</span>
      {second.length > 0 && <><small>2º sorteio</small><span className="pgr-balls">{second.map((n, i) => <span className="apr-ball" key={`s-${n}-${i}`}>{two(n)}</span>)}</span></>}
      {scored.length > 0 && <span className="pgr-best">Melhor jogo: <b>{best} {best === 1 ? 'acerto' : 'acertos'}</b></span>}
    </div>
    {scored.length > 0 && <div className="pgr-games">
      {shown.map((game) => <div className="pgr-game" key={game.ordem}>
        <span className="pgr-label">Jogo {two(game.ordem)}</span>
        <span className="pgr-nums">{game.numeros.map((n, i) => <span key={`${n}-${i}`} className={`pgr-num${hits.has(n) ? ' is-official-hit' : ''}`} title={hits.has(n) ? `${two(n)}: acertou` : undefined}>{two(n)}</span>)}</span>
        <span className={`pgr-count${game.acertos > 0 ? ' has-hits' : ''}`}>{game.acertos} {game.acertos === 1 ? 'acerto' : 'acertos'}</span>
      </div>)}
      {scored.length > shown.length && <small className="pgr-more">Mostrando os {shown.length} jogos que mais acertaram de {scored.length}.{moreHref && <> <a className="admin-text-link" href={moreHref} target="_blank" rel="noreferrer">Ver todos os jogos marcados</a></>}</small>}
    </div>}
  </div>;
}
