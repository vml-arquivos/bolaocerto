'use client';
import { useEffect, useRef, useState } from 'react';

type Game = { ordem: number; numeros: number[] };
const pad = (value: number) => String(value).padStart(2, '0');

/**
 * Números do bolão: mostra o primeiro jogo e, quando há mais de um (ou o jogo é grande),
 * abre uma janela com todos os jogos e todas as dezenas.
 */
export function PoolNumbers({ games, name, hits = [] }: { games: Game[]; name: string; hits?: number[] }) {
  // Depois do sorteio (resultado sincronizado da CAIXA), cada número acertado ganha um X vermelho em cima.
  const hit = new Set(hits);
  const drawn = hit.size > 0;
  const ballClass = (number: number, extra = '') => `number-ball${extra}${hit.has(number) ? ' is-official-hit' : ''}`;
  const ballTitle = (number: number) => (hit.has(number) ? `${pad(number)}: acertou` : undefined);
  const hitsOf = (game: Game) => game.numeros.filter((number) => hit.has(number)).length;
  const hitsLabel = (count: number) => `${count} ${count === 1 ? 'acerto' : 'acertos'}`;
  const dialog = useRef<HTMLDialogElement>(null);
  const [open, setOpen] = useState(false);
  const first = games[0] ?? { ordem: 1, numeros: [] as number[] };
  const total = games.reduce((sum, game) => sum + game.numeros.length, 0);
  const many = games.length > 1;
  const best = drawn ? Math.max(0, ...games.map(hitsOf)) : 0;
  const PREVIEW = 20;
  const truncated = !many && first.numeros.length > PREVIEW;

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
    const lock = open ? 'hidden' : '';
    document.body.style.overflow = lock;
    return () => { document.body.style.overflow = ''; };
  }, [open]);

  if (!games.length) return <section className="pool-numbers pool-numbers-pending" aria-labelledby="numeros-titulo">
    <div className="pool-numbers-head"><h2 id="numeros-titulo">Números do bolão</h2><span>A definir</span></div>
    <p className="muted">Os jogos ainda não foram escolhidos. Eles serão publicados aqui antes do fechamento das apostas, e quem já comprou cota recebe um aviso.</p>
  </section>;
  return <section className="pool-numbers" aria-labelledby="numeros-titulo">
    <div className="pool-numbers-head">
      <h2 id="numeros-titulo">Números do bolão</h2>
      <span>{many ? `${games.length} jogos` : '1 jogo'} · {first.numeros.length} números {many ? 'cada' : ''}</span>
    </div>
    {drawn && <p className="pool-hits-summary"><span className="hit-x-sample" aria-hidden="true" /> {many ? <>Números acertados marcados com X. Jogo 01: <strong>{hitsLabel(hitsOf(first))}</strong> · melhor jogo: <strong>{hitsLabel(best)}</strong></> : <>Números acertados marcados com X: <strong>{hitsLabel(hitsOf(first))}</strong></>}</p>}
    <div className="result-balls pool-numbers-balls" aria-label={many ? 'Primeiro jogo' : 'Números apostados'}>
      {(truncated ? first.numeros.slice(0, PREVIEW) : first.numeros).map((number, index) => <span className={ballClass(number)} title={ballTitle(number)} key={`${number}-${index}`}>{pad(number)}</span>)}
      {truncated && <span className="number-more">+{first.numeros.length - PREVIEW}</span>}
    </div>
    {(many || truncated) && <button type="button" className="button button-secondary pool-numbers-open" onClick={() => setOpen(true)}>Ver todos os números{many ? ` (${games.length} jogos)` : ''}</button>}
    <dialog ref={dialog} className="numbers-dialog" aria-labelledby="numeros-dialogo-titulo" onClose={() => setOpen(false)} onClick={(event) => { if (event.target === dialog.current) setOpen(false); }}>
      <div className="numbers-dialog-card">
        <header><div><h3 id="numeros-dialogo-titulo">Todos os números</h3><small>{name} · {games.length} {games.length === 1 ? 'jogo' : 'jogos'} · {total} números</small></div>
          <button type="button" className="numbers-dialog-close" onClick={() => setOpen(false)} aria-label="Fechar">×</button></header>
        <div className="numbers-dialog-body">{games.map((game) => <article key={game.ordem}>
          <strong>Jogo {pad(game.ordem)}{drawn && <small className={`game-hits${hitsOf(game) > 0 ? ' has-hits' : ''}`}> · {hitsLabel(hitsOf(game))}</small>}</strong>
          <div className="result-balls">{game.numeros.map((number, index) => <span className={ballClass(number, ' number-ball-sm')} title={ballTitle(number)} key={`${number}-${index}`}>{pad(number)}</span>)}</div>
        </article>)}</div>
      </div>
    </dialog>
  </section>;
}
