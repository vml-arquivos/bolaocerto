import Link from 'next/link';
import { PublicPool, modalityNames, money, shortDate } from '../lib/domain';
import { concursoNo, festaPrefix } from '../lib/contest';

/** Bolões de concursos que já foram sorteados: números oficiais e quantos acertos cada jogo teve. */
export function DrawnPools({ pools }: { pools: PublicPool[] }) {
  if (!pools.length) return <p className="muted">Quando um concurso for sorteado, os bolões dele aparecem aqui com os números oficiais.</p>;
  return <div className="pool-grid">{pools.map((pool) => {
    const drawn = pool.resultado?.numerosSorteados ?? pool.transparencia?.apuracao?.sorteados ?? [];
    const second = pool.resultado?.numerosSegundoSorteio ?? pool.transparencia?.apuracao?.segundoSorteio ?? [];
    const hits = new Set([...drawn, ...second]);
    const games = pool.jogos?.length ? pool.jogos : [{ id: 'unico', ordem: 1, numeros: pool.numerosApostados }];
    const prize = pool.transparencia?.premioTotal;
    const won = pool.teveGanhador || Number(prize ?? 0) > 0;
    return <article key={pool.id} className="pool-card drawn-pool"><div className="pool-card-body">
      <span className="overline">{modalityNames[pool.concurso?.modalidade ?? ''] ?? 'Bolão'} · {festaPrefix(pool.concurso)}concurso {concursoNo(pool.concurso?.numeroConcurso)}</span>
      <h3>{pool.grupo?.nome ?? 'Bolão BL'}</h3>
      <p className="muted">Sorteio em {shortDate(pool.concurso?.dataSorteio)}</p>
      <strong>Números sorteados</strong>
      <div className="result-balls" aria-label="Números sorteados">{drawn.map((n, i) => <span className="number-ball is-drawn" key={i}>{String(n).padStart(2, '0')}</span>)}</div>
      {second.length > 0 && <><p>Segundo sorteio</p><div className="result-balls" aria-label="Segundo sorteio">{second.map((n, i) => <span className="number-ball is-drawn" key={i}>{String(n).padStart(2, '0')}</span>)}</div></>}
      <details className="drawn-games"><summary>{games.length === 1 ? 'Ver o jogo do bolão' : `Ver os ${games.length} jogos do bolão`}</summary>
        {games.slice(0, 20).map((game) => {
          const count = game.numeros.filter((n) => hits.has(n)).length;
          return <div className="drawn-game" key={game.id}><div className="result-balls">{game.numeros.map((n, i) => <span className={`number-ball ${hits.has(n) ? 'is-hit' : ''}`} key={i}>{String(n).padStart(2, '0')}</span>)}</div><small>{count} {count === 1 ? 'acerto' : 'acertos'}</small></div>;
        })}
        {games.length > 20 && <small>Mostrando 20 de {games.length} jogos. Veja todos na página do bolão.</small>}
      </details>
      <p className="drawn-status">{won ? <strong>Bolão premiado{prize ? `: ${money(prize)}` : ''}</strong> : pool.status === 'apurado' ? 'Apurado: sem prêmio neste concurso.' : 'Aguardando a apuração do bolão.'}</p>
      <p><Link className="text-link" href={`/boloes/${pool.id}`}>Consultar jogos e comprovantes</Link></p>
    </div></article>;
  })}</div>;
}
