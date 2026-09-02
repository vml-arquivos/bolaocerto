import Link from 'next/link';
import { modalityNames, money, PublicPool, shortDate } from '../lib/domain';

export function PoolCard({ pool }: { pool: PublicPool }) {
  const sold = Math.max(pool.totalCotas - pool.cotasDisponiveis, 0);
  const progress = Math.min(100, Math.round((sold / Math.max(pool.totalCotas, 1)) * 100));
  return <article className="pool-card"><div className="pool-top"><span className={`lottery-badge ${pool.concurso?.modalidade ?? ''}`}>{modalityNames[pool.concurso?.modalidade ?? ''] ?? 'Bolão oficial'}</span><span className="status-dot">{pool.status}</span></div><div><p className="overline">{pool.grupo?.nome ?? 'BL Oficial'}</p><h3>{pool.grupo?.descricao || `Concurso ${pool.concurso?.numeroConcurso ?? '—'}`}</h3></div><div className="pool-prize"><span>Prêmio estimado</span><strong>{money(pool.concurso?.valorEstimadoPremio)}</strong></div><div className="pool-meta"><span>Concurso <strong>{pool.concurso?.numeroConcurso ?? '—'}</strong></span><span>Sorteio <strong>{shortDate(pool.concurso?.dataSorteio)}</strong></span></div><div className="progress-head"><span>{progress}% preenchido</span><span>{pool.cotasDisponiveis} cotas disponíveis</span></div><div className="progress"><i style={{ width: `${progress}%` }} /></div><div className="pool-bottom"><div><small>A partir de</small><strong>{money(pool.valorCota)}</strong><span>por cota</span></div><Link className="button button-primary" href={`/boloes/${pool.id}`}>Ver bolão</Link></div></article>;
}
