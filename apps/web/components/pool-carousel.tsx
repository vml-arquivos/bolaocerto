'use client';
import Link from 'next/link';
import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import { canPurchase, hasShares, saleRuleState, withinSaleWindow } from '../lib/pool-availability';
import { contestLabel } from '../lib/contest';
import { modalityNames, money, shortDate, type PublicPool } from '../lib/domain';
import { lotteryVisual } from '../lib/lottery-config';
import { useSaleClock } from './live-storefront';

/** Bolões disponíveis em carrossel: passam para o lado, cada um leva para a tela do bolão. */
export function PoolCarousel({ pools, serverNow }: { pools: PublicPool[]; serverNow: number }) {
  const now = useSaleClock(serverNow);
  const [modality, setModality] = useState('todas');
  const [active, setActive] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const open = useMemo(() => pools.filter((pool) => withinSaleWindow(pool, now) && hasShares(pool))
    .sort((a, b) => new Date(a.concurso?.dataSorteio ?? 0).getTime() - new Date(b.concurso?.dataSorteio ?? 0).getTime()), [pools, now]);
  const modalities = Array.from(new Set(open.map((pool) => pool.concurso?.modalidade).filter(Boolean))) as string[];
  const shown = modality === 'todas' ? open : open.filter((pool) => pool.concurso?.modalidade === modality);

  useEffect(() => { setActive(0); track.current?.scrollTo({ left: 0 }); }, [modality]);
  function onScroll() {
    const node = track.current;
    if (!node || !node.firstElementChild) return;
    const slide = (node.firstElementChild as HTMLElement).offsetWidth + 12;
    setActive(Math.min(shown.length - 1, Math.max(0, Math.round(node.scrollLeft / slide))));
  }
  function go(direction: 1 | -1) {
    const node = track.current;
    if (!node || !node.firstElementChild) return;
    node.scrollBy({ left: direction * ((node.firstElementChild as HTMLElement).offsetWidth + 12), behavior: 'smooth' });
  }

  if (!open.length) return <div className="empty-state compact"><h3>Nenhum bolão aberto agora</h3><p>Novos bolões aparecem aqui assim que forem publicados.</p></div>;
  return <section className="carousel-app" aria-label="Bolões disponíveis">
    {modalities.length > 1 && <div className="chip-row" role="tablist" aria-label="Modalidade">
      <button type="button" role="tab" aria-selected={modality === 'todas'} className={modality === 'todas' ? 'is-on' : ''} onClick={() => setModality('todas')}>Todos</button>
      {modalities.map((item) => <button type="button" role="tab" key={item} aria-selected={modality === item} className={modality === item ? 'is-on' : ''} onClick={() => setModality(item)}>{modalityNames[item] ?? item}</button>)}
    </div>}
    <div className="carousel-frame">
      <button type="button" className="carousel-arrow is-prev" onClick={() => go(-1)} aria-label="Bolão anterior" disabled={active <= 0}>‹</button>
      <div className="carousel-track" ref={track} onScroll={onScroll} tabIndex={0}>
        {shown.map((pool) => {
          const visual = lotteryVisual(pool.concurso?.modalidade);
          const unlimited = pool.cotasIlimitadas || pool.cotasDisponiveis === null;
          const sold = unlimited ? 0 : Math.max((pool.totalCotas ?? 0) - (pool.cotasDisponiveis ?? 0), 0);
          const progress = unlimited ? 0 : Math.min(100, Math.round((sold / Math.max(pool.totalCotas ?? 1, 1)) * 100));
          const isOpen = canPurchase(pool, now);
          const soon = saleRuleState(pool, now) === 'em_breve';
          return <Link key={pool.id} href={`/boloes/${pool.id}`} className="slide" style={{ '--pool-accent': visual.accent } as CSSProperties}>
            <div className="slide-art"><img src={visual.art} alt="" loading="lazy" /><div className="slide-shade" /><strong>{modalityNames[pool.concurso?.modalidade ?? ''] ?? visual.name}</strong><span className={`slide-tag ${isOpen ? 'is-open' : ''}`}>{isOpen ? 'Cotas abertas' : soon ? 'Em breve' : 'Aguardando prêmio'}</span></div>
            <div className="slide-body">
              <small>{pool.grupo?.nome ?? 'Bolão BL'} · {contestLabel(pool.concurso)} · sorteio {shortDate(pool.concurso?.dataSorteio)}</small>
              <div className="slide-prize"><span>Prêmio estimado</span><strong>{money(pool.concurso?.valorEstimadoPremio)}</strong></div>
              <div className="slide-facts"><div><span>Cota</span><strong>{money(pool.valorCota)}</strong></div><div><span>Livres</span><strong>{unlimited ? 'Ilimitadas' : pool.cotasDisponiveis}</strong></div></div>
              {!unlimited && <div className="slide-progress" aria-label={`${progress}% preenchido`}><i style={{ width: `${progress}%` }} /></div>}
              <span className={`button ${isOpen ? 'button-primary' : 'button-secondary'}`}>{isOpen ? 'Ver bolão' : 'Ver detalhes'}</span>
            </div>
          </Link>;
        })}
      </div>
      <button type="button" className="carousel-arrow is-next" onClick={() => go(1)} aria-label="Próximo bolão" disabled={active >= shown.length - 1}>›</button>
    </div>
    {shown.length > 1 && <div className="carousel-dots" aria-hidden="true">{shown.map((pool, index) => <i key={pool.id} className={index === active ? 'is-on' : ''} />)}</div>}
  </section>;
}
