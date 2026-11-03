'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { CSSProperties } from 'react';
import { countdown } from '../lib/home';

export type DrawItem = { key: string; nome: string; icon: string; accent: string; sorteioEm: string; premio?: string; festa?: string };

/** Faixa "Próximos sorteios": uma ficha por jogo com a contagem regressiva até o sorteio. */
export function DrawCountdown({ items, serverNow }: { items: DrawItem[]; serverNow: number }) {
  const [now, setNow] = useState(serverNow);
  useEffect(() => {
    setNow(Date.now());
    const timer = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  return <ul className="draw-strip" aria-label="Próximos sorteios">{items.map((item) => {
    const left = countdown(new Date(item.sorteioEm).getTime(), now);
    return <li key={item.key}><Link href="#boloes" className="draw-chip" style={{ '--chip-accent': item.accent } as CSSProperties}>
      <span className="draw-chip-icon" aria-hidden="true">{item.icon}</span>
      <span className="draw-chip-text"><strong>{item.nome}</strong><small>{item.festa ?? 'Próximo sorteio'}</small></span>
      <span className="draw-chip-time"><b>{left ?? 'Sorteio hoje'}</b>{item.premio && <small>{item.premio}</small>}</span>
    </Link></li>;
  })}</ul>;
}
