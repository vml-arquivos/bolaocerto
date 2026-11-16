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

/**
 * Cartão do bolão sorteado que encolhe e abre: fechado mostra o nome do bolão, os dados principais e o melhor jogo;
 * aberto mostra os números sorteados e cada jogo com X vermelho nos números acertados.
 */
export function PoolResultCard({ title, subtitle, details = [], drawn, second = [], games, open = false, maxGames = 10, moreHref }: { title: string; subtitle?: string; details?: string[]; drawn: number[]; second?: number[]; games: Game[]; open?: boolean; maxGames?: number; moreHref?: string }) {
  if (!drawn.length) return null;
  const hits = new Set([...drawn, ...second]);
  const best = games.reduce((max, game) => Math.max(max, game.numeros.filter((n) => hits.has(n)).length), 0);
  return <details className="pool-result-card" open={open || undefined}>
    <summary>
      <span className="prc-caret" aria-hidden="true" />
      <span className="prc-main"><strong>{title}</strong>{subtitle && <small>{subtitle}</small>}</span>
      <span className="prc-tags">{details.map((item) => <span className="prc-tag" key={item}>{item}</span>)}</span>
      {games.length > 0 && <span className={`prc-best${best > 0 ? ' has-hits' : ''}`}><span><b>{best}</b> {best === 1 ? 'acerto' : 'acertos'}</span><small>melhor jogo{games.length > 1 ? ` de ${games.length}` : ''}</small></span>}
    </summary>
    <div className="prc-body">
      <PoolGamesResult drawn={drawn} second={second} games={games} maxGames={maxGames} moreHref={moreHref} />
      {moreHref && <a className="admin-text-link prc-link" href={moreHref} target="_blank" rel="noreferrer">Abrir o bolão</a>}
    </div>
  </details>;
}
