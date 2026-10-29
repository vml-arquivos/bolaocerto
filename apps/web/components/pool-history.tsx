import Link from 'next/link';
import { PublicPool, modalityNames, shortDate } from '../lib/domain';
export function PoolHistory({ pools }: { pools: PublicPool[] }) {
  if (!pools.length) return <p className="muted">Os bolões encerrados e os resultados oficiais aparecerão aqui.</p>;
  return <div className="pool-grid">{pools.map(pool => {
    const numbers = pool.resultado?.numerosSorteados ?? pool.transparencia?.apuracao?.sorteados ?? [];
    const second = pool.resultado?.numerosSegundoSorteio ?? pool.transparencia?.apuracao?.segundoSorteio ?? [];
    return <article key={pool.id} className="pool-card"><div className="pool-card-body">
      <span className="overline">{modalityNames[pool.concurso?.modalidade ?? ''] ?? 'Bolão'} · concurso {pool.concurso?.numeroConcurso}</span>
      <h3>{pool.grupo?.nome ?? 'Bolão BL'}</h3><p className="muted">Sorteio: {shortDate(pool.concurso?.dataSorteio)}</p>
      <strong>{numbers.length ? 'Números sorteados' : 'Vendas encerradas · aguardando resultado oficial'}</strong>
      {numbers.length > 0 && <div className="result-balls" aria-label="Números sorteados">{numbers.map((n,i) => <span className="number-ball" key={i}>{String(n).padStart(2,'0')}</span>)}</div>}
      {second.length > 0 && <><p>Segundo sorteio</p><div className="result-balls" aria-label="Segundo sorteio">{second.map((n,i) => <span className="number-ball" key={i}>{String(n).padStart(2,'0')}</span>)}</div></>}
      <p><Link className="text-link" href={`/boloes/${pool.id}`}>Consultar jogos e comprovantes</Link></p>
    </div></article>;
  })}</div>;
}
