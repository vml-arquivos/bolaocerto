import Image from 'next/image';
import type { CSSProperties } from 'react';
import Link from 'next/link';
import { modalityNames, money, PublicContest } from '../lib/domain';
import { contestForModality, orderedLotteryVisuals } from '../lib/lottery-config';

export function ModalityShowcase({ contests }: { contests: PublicContest[] }) {
  return <div className="modality-grid">{orderedLotteryVisuals().map((visual) => {
    const contest = contestForModality(contests, visual.key);
    return <article className="modality-card" key={visual.key} style={{ '--modality-accent': visual.accent, '--modality-soft': visual.soft } as CSSProperties}>
      <div className="modality-art"><Image src={visual.art} alt="" fill sizes="(max-width: 640px) 100vw, (max-width: 960px) 50vw, 33vw" loading="lazy" /><div className="modality-art-shade" /><div className="modality-title"><span>{visual.eyebrow}</span><strong>{modalityNames[visual.key] ?? visual.name}</strong></div></div>
      <div className="modality-body">{contest ? <><div className="modality-prize"><span>Prêmio estimado</span><strong>{money(contest.valorEstimadoPremio)}</strong></div><div className="modality-meta"><span>Concurso <b>{contest.numeroConcurso}</b></span><span>Sorteio <b>{new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(contest.dataSorteio))}</b></span></div></> : <p className="modality-empty">Próximo concurso em atualização.</p>}<Link className="modality-link" href="#boloes">Encontrar bolões <span aria-hidden="true">→</span></Link></div>
    </article>;
  })}</div>;
}
