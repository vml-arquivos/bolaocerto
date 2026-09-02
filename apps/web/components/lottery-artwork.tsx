import Image from 'next/image';
import type { CSSProperties } from 'react';
import { lotteryVisual } from '../lib/lottery-config';

export function LotteryArtwork({ modality, compact = false }: { modality?: string | null; compact?: boolean }) {
  const visual = lotteryVisual(modality);
  return <div className={`lottery-artwork${compact ? ' lottery-artwork-compact' : ''}`} style={{ '--lottery-accent': visual.accent } as CSSProperties}>
    <Image src={visual.art} alt="" fill sizes={compact ? '(max-width: 640px) 100vw, 340px' : '(max-width: 960px) 100vw, 560px'} priority={!compact} />
    <div className="lottery-artwork-overlay" />
    <div className="lottery-artwork-content"><span className="artwork-kicker">{visual.eyebrow}</span><strong>{visual.name}</strong><span>{visual.description}</span></div>
  </div>;
}
