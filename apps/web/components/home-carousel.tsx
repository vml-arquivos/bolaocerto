'use client';

import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { CSSProperties } from 'react';

export type CarouselSlide = {
  key: string; eyebrow?: string; titulo: string; subtitulo?: string;
  valor?: string; valorRotulo?: string; botao?: string; href?: string; art: string; accent: string;
};

/** Carrossel de destaques da página inicial: passa sozinho, pausa com o mouse/foco e respeita "reduzir movimento". */
export function HomeCarousel({ slides }: { slides: CarouselSlide[] }) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [reduced, setReduced] = useState(false);
  const touchX = useRef<number | null>(null);
  const total = slides.length;
  const go = useCallback((next: number) => setIndex(((next % total) + total) % total), [total]);

  useEffect(() => {
    try { setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches); } catch { /* sem matchMedia */ }
  }, []);
  useEffect(() => {
    if (total < 2 || paused || reduced) return;
    const timer = setInterval(() => setIndex((value) => (value + 1) % total), 6500);
    return () => clearInterval(timer);
  }, [total, paused, reduced]);
  useEffect(() => { if (index >= total) setIndex(0); }, [index, total]);

  if (!total) return null;
  return <section
    className="home-carousel shell" aria-roledescription="carrossel" aria-label="Destaques"
    onMouseEnter={() => setPaused(true)} onMouseLeave={() => setPaused(false)} onFocus={() => setPaused(true)} onBlur={() => setPaused(false)}
    onTouchStart={(event) => { touchX.current = event.touches[0]?.clientX ?? null; }}
    onTouchEnd={(event) => { const start = touchX.current; touchX.current = null; const end = event.changedTouches[0]?.clientX; if (start === null || end === undefined || Math.abs(end - start) < 45) return; go(index + (end < start ? 1 : -1)); }}
  >
    <div className="home-carousel-track">
      {slides.map((slide, position) => <article
        key={slide.key} className={`home-slide ${position === index ? 'is-active' : ''}`} style={{ '--slide-accent': slide.accent } as CSSProperties}
        role="group" aria-roledescription="destaque" aria-label={`${position + 1} de ${total}`} aria-hidden={position !== index}
      >
        <img className="home-slide-art" src={slide.art} alt="" loading={position === 0 ? 'eager' : 'lazy'} />
        <div className="home-slide-shade" />
        <div className="home-slide-copy">
          {slide.eyebrow && <span className="home-slide-eyebrow">{slide.eyebrow}</span>}
          <h2>{slide.titulo}</h2>
          {slide.subtitulo && <p>{slide.subtitulo}</p>}
          {slide.valor && <div className="home-slide-value"><small>{slide.valorRotulo ?? 'Prêmio estimado'}</small><strong>{slide.valor}</strong></div>}
          {slide.botao && slide.href && (slide.href.startsWith('http') ? <a className="button button-primary button-large" href={slide.href} tabIndex={position === index ? 0 : -1} rel="noopener noreferrer">{slide.botao} <span aria-hidden="true">→</span></a> : <Link className="button button-primary button-large" href={slide.href} tabIndex={position === index ? 0 : -1}>{slide.botao} <span aria-hidden="true">→</span></Link>)}
        </div>
      </article>)}
    </div>
    {total > 1 && <div className="home-carousel-controls">
      <button type="button" aria-label="Destaque anterior" onClick={() => go(index - 1)}>‹</button>
      <div className="home-carousel-dots" role="tablist" aria-label="Escolher destaque">{slides.map((slide, position) => <button type="button" role="tab" key={slide.key} aria-selected={position === index} aria-label={`Destaque ${position + 1}`} className={position === index ? 'is-active' : ''} onClick={() => go(position)} />)}</div>
      <button type="button" aria-label="Próximo destaque" onClick={() => go(index + 1)}>›</button>
    </div>}
  </section>;
}
