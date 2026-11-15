import Link from 'next/link';
import { PublicPool, modalityNames, shortDate } from '../lib/domain';
import { concursoNo, festaPrefix } from '../lib/contest';
import { OfficialResult } from './official-result';
export function PoolHistory({ pools }: { pools: PublicPool[] }) {
  if (!pools.length) return <p className="muted">Os bolões encerrados e os resultados oficiais aparecerão aqui.</p>;
  return <div className="pool-grid">{pools.map(pool => {
    const numbers = pool.resultado?.numerosSorteados ?? pool.transparencia?.apuracao?.sorteados ?? [];
    const second = pool.resultado?.numerosSegundoSorteio ?? pool.transparencia?.apuracao?.segundoSorteio ?? [];
    return <article key={pool.id} className="pool-card"><div className="pool-card-body">
      <span className="overline">{modalityNames[pool.concurso?.modalidade ?? ''] ?? 'Bolão'} · {festaPrefix(pool.concurso)}concurso {concursoNo(pool.concurso?.numeroConcurso)}</span>
      <h3>{pool.grupo?.nome ?? 'Bolão BL'}</h3><p className="muted">Sorteio: {shortDate(pool.concurso?.dataSorteio)}</p>
      {numbers.length ? <OfficialResult numbers={numbers} second={second} contest={pool.concurso?.numeroConcurso} title="Números sorteados" compact /> : <strong>Vendas encerradas · aguardando resultado oficial</strong>}
      <p><Link className="text-link" href={`/boloes/${pool.id}`}>Consultar jogos e comprovantes</Link></p>
    </div></article>;
  })}</div>;
}
