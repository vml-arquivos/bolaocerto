import Link from 'next/link';
import type { CSSProperties } from 'react';
import { modalityNames, money, PublicPool, shortDate } from '../lib/domain';
import { lotteryVisual } from '../lib/lottery-config';

export function PoolCard({ pool }: { pool: PublicPool }) {
  const unlimited = pool.cotasIlimitadas || pool.cotasDisponiveis === null;
  const sold = unlimited ? 0 : Math.max((pool.totalCotas ?? 0) - (pool.cotasDisponiveis ?? 0), 0);
  const progress = unlimited ? 0 : Math.min(100, Math.round((sold / Math.max(pool.totalCotas ?? 1, 1)) * 100));
  const visual = lotteryVisual(pool.concurso?.modalidade);
  const isOpen = pool.status === 'aberto' && (unlimited || (pool.cotasDisponiveis ?? 0) > 0);
  const progressState = unlimited ? '' : progress >= 100 ? 'is-full' : progress >= 85 ? 'is-high' : progress >= 40 ? 'is-mid' : 'is-low';
  return <article className="pool-card" style={{ '--pool-accent': visual.accent, '--pool-soft': visual.soft } as CSSProperties}>
    <div className="pool-art"><img src={visual.art} alt="" loading="lazy" /><div className="pool-art-shade" /><div className="pool-art-copy"><span>{visual.eyebrow}</span><strong>{modalityNames[pool.concurso?.modalidade ?? ''] ?? visual.name}</strong></div><span className={`pool-status ${isOpen ? 'is-open' : 'is-closed'}`}>{isOpen ? 'Cotas abertas' : 'Encerrado'}</span></div>
    <div className="pool-card-body"><div className="pool-heading"><div><p className="overline">{pool.grupo?.nome ?? 'Bolão BL'}</p><h3>{pool.grupo?.descricao || `Concurso ${pool.concurso?.numeroConcurso ?? '—'}`}</h3></div><span className="pool-kind">{pool.modeloOperacional === 'mandato' ? 'Mandato' : 'Parceiro'}</span></div>
      <div className="pool-prize"><span>Prêmio estimado</span><strong>{money(pool.concurso?.valorEstimadoPremio)}</strong><small>{pool.concurso?.acumulado ? 'Acumulado para o próximo concurso' : 'Atualizado pelo concurso oficial'}</small></div>
      <div className="pool-meta"><span>Concurso <strong>{pool.concurso?.numeroConcurso ?? '—'}</strong></span><span>Sorteio <strong>{shortDate(pool.concurso?.dataSorteio)}</strong></span></div>
      <div className={`progress-block ${progressState}`}><div className="progress-head"><span>{unlimited ? 'Disponibilidade ilimitada' : `${progress}% preenchido`}</span><strong>{unlimited ? 'Cotas livres' : `${pool.cotasDisponiveis} cotas livres`}</strong></div>{unlimited ? <div className="unlimited-badge">Reservas sob demanda</div> : <div className="progress" aria-label={`${progress}% das cotas preenchidas`}><i style={{ width: `${progress}%` }} /></div>}</div>
      <div className="pool-bottom"><div><small>Valor por cota</small><strong>{money(pool.valorCota)}</strong><span>Taxa de administração: {pool.taxaAdministracaoPct}%</span></div><Link className={`button ${isOpen ? 'button-primary' : 'button-disabled'}`} aria-disabled={!isOpen} href={`/boloes/${pool.id}`}>{isOpen ? 'Ver bolão' : 'Consultar'} <span aria-hidden="true">→</span></Link></div>
    </div>
  </article>;
}
