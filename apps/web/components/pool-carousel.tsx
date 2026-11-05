'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { canPurchase, hasShares, saleRuleState, withinSaleWindow } from '../lib/pool-availability';
import { concursoNo, contestLabel } from '../lib/contest';
import { modalityNames, money, shortDate, type PublicPool } from '../lib/domain';
import { lotteryVisual } from '../lib/lottery-config';
import { useSaleClock } from './live-storefront';

/** Bolões disponíveis em carrossel: passam para o lado, cada um leva para a tela do bolão. */
export function PoolCarousel({ pools, serverNow }: { pools: PublicPool[]; serverNow: number }) {
  const now = useSaleClock(serverNow);
  const [modality, setModality] = useState('todas');
  const [view, setView] = useState({ page: 0, pages: 1, start: true, end: true });
  const track = useRef<HTMLDivElement>(null);
  const open = useMemo(() => pools.filter((pool) => withinSaleWindow(pool, now) && hasShares(pool))
    .sort((a, b) => new Date(a.concurso?.dataSorteio ?? 0).getTime() - new Date(b.concurso?.dataSorteio ?? 0).getTime()), [pools, now]);
  const modalities = Array.from(new Set(open.map((pool) => pool.concurso?.modalidade).filter(Boolean))) as string[];
  const shown = modality === 'todas' ? open : open.filter((pool) => pool.concurso?.modalidade === modality);

  const GAP = 14;
  function measure() {
    const node = track.current;
    if (!node) return;
    const step = node.clientWidth + GAP;
    const pages = Math.max(1, Math.ceil((node.scrollWidth + GAP) / step - 0.02));
    const start = node.scrollLeft <= 2;
    const end = node.scrollLeft + node.clientWidth >= node.scrollWidth - 2;
    setView({ page: end ? pages - 1 : Math.min(pages - 1, Math.round(node.scrollLeft / step)), pages, start, end });
  }
  useEffect(() => { track.current?.scrollTo({ left: 0 }); measure(); }, [modality, shown.length]);
  useEffect(() => { window.addEventListener('resize', measure); return () => window.removeEventListener('resize', measure); });
  function go(direction: 1 | -1) {
    const node = track.current;
    if (!node) return;
    node.scrollBy({ left: direction * (node.clientWidth + GAP), behavior: 'smooth' });
  }

  if (!open.length) return <div className="empty-state compact"><h3>Nenhum bolão aberto agora</h3><p>Novos bolões aparecem aqui assim que forem publicados.</p></div>;
  return <section className="carousel-app" aria-label="Bolões disponíveis">
    {modalities.length > 1 && <div className="chip-row" role="tablist" aria-label="Modalidade">
      <button type="button" role="tab" aria-selected={modality === 'todas'} className={modality === 'todas' ? 'is-on' : ''} onClick={() => setModality('todas')}>Todos</button>
      {modalities.map((item) => <button type="button" role="tab" key={item} aria-selected={modality === item} className={modality === item ? 'is-on' : ''} onClick={() => setModality(item)}>{modalityNames[item] ?? item}</button>)}
    </div>}
    <div className="carousel-frame">
      <div className="carousel-track" ref={track} onScroll={measure} tabIndex={0}>
        {shown.map((pool) => {
          const visual = lotteryVisual(pool.concurso?.modalidade);
          const unlimited = pool.cotasIlimitadas || pool.cotasDisponiveis === null;
          const sold = unlimited ? 0 : Math.max((pool.totalCotas ?? 0) - (pool.cotasDisponiveis ?? 0), 0);
          const progress = unlimited ? 0 : Math.min(100, Math.round((sold / Math.max(pool.totalCotas ?? 1, 1)) * 100));
          const isOpen = canPurchase(pool, now);
          const soon = saleRuleState(pool, now) === 'em_breve';
          return <Link key={pool.id} href={`/boloes/${pool.id}`} className="slide" style={{ '--pool-accent': visual.accent } as CSSProperties}>
            <div className="slide-art"><img src={visual.art} alt="" loading="lazy" /><div className="slide-shade" /><div className="slide-title"><strong>{modalityNames[pool.concurso?.modalidade ?? ''] ?? visual.name}</strong>{pool.concurso?.nomeEspecial && <em>{pool.concurso.nomeEspecial}</em>}</div><span className={`slide-tag ${isOpen ? 'is-open' : ''}`}>{isOpen ? 'Cotas abertas' : soon ? 'Em breve' : 'Aguardando prêmio'}</span></div>
            <div className="slide-body">
              <small>{pool.grupo?.nome ?? 'Bolão BL'}</small><p className="slide-when">{pool.concurso?.nomeEspecial ? `Concurso ${concursoNo(pool.concurso?.numeroConcurso)}` : contestLabel(pool.concurso)} · sorteio {shortDate(pool.concurso?.dataSorteio)}</p>
              <div className="slide-prize"><span>Prêmio estimado</span><strong className={pool.concurso?.valorEstimadoPremio ? '' : 'is-pending'}>{pool.concurso?.valorEstimadoPremio ? money(pool.concurso.valorEstimadoPremio) : 'A divulgar'}</strong></div>
              <div className="slide-facts"><div><span>Cota</span><strong>{money(pool.valorCota)}</strong></div><div><span>Livres</span><strong>{unlimited ? 'Ilimitadas' : pool.cotasDisponiveis}</strong></div></div>
              {!unlimited && <div className="slide-progress" aria-label={`${progress}% preenchido`}><i style={{ width: `${progress}%` }} /></div>}
              <span className={`button ${isOpen ? 'button-primary' : 'button-secondary'}`}>{isOpen ? 'Ver bolão' : 'Ver detalhes'}</span>
            </div>
          </Link>;
        })}
      </div>
    </div>
    {view.pages > 1 && <div className="carousel-nav">
      <button type="button" onClick={() => go(-1)} aria-label="Bolões anteriores" disabled={view.start}>‹</button>
      {view.pages <= 7 ? <div className="carousel-dots" aria-hidden="true">{Array.from({ length: view.pages }, (_, index) => <i key={index} className={index === view.page ? 'is-on' : ''} />)}</div> : <span className="carousel-count" aria-live="polite">{view.page + 1} de {view.pages}</span>}
      <button type="button" onClick={() => go(1)} aria-label="Próximos bolões" disabled={view.end}>›</button>
    </div>}
  </section>;
}
