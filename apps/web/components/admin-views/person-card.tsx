'use client';
import Link from 'next/link';
import type { ReactNode } from 'react';

/* Cartão de pessoa (afiliado, cliente, usuário): mesmo desenho no celular e no computador. */

export function initials(name: unknown): string {
  const parts = String(name ?? '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return '—';
  return `${parts[0]![0] ?? ''}${parts.length > 1 ? parts[parts.length - 1]![0] ?? '' : ''}`.toUpperCase();
}

export type PersonStat = { label: string; value: ReactNode; hint?: ReactNode; href?: string };

export function PersonCard({ name, subtitle, status, tags, stats, footer, actions, tone }: { name: ReactNode; subtitle?: ReactNode; status?: ReactNode; tags?: ReactNode; stats?: PersonStat[]; footer?: ReactNode; actions?: ReactNode; tone?: 'muted' }) {
  return <article className={`pc-card${tone === 'muted' ? ' is-muted' : ''}`}>
    <header className="pc-head">
      <span className="pc-avatar" aria-hidden="true">{initials(typeof name === 'string' ? name : '')}</span>
      <div className="pc-id"><strong>{name}</strong>{subtitle && <small>{subtitle}</small>}</div>
      {status && <div className="pc-status">{status}</div>}
    </header>
    {tags && <div className="pc-tags">{tags}</div>}
    {stats && stats.length > 0 && <dl className={`pc-stats pc-stats-${Math.min(stats.length, 4)}`}>{stats.map((stat) => <div key={stat.label}>
      <dt>{stat.label}</dt>
      <dd>{stat.href ? <Link href={stat.href}>{stat.value}</Link> : stat.value}</dd>
      {stat.hint && <small>{stat.hint}</small>}
    </div>)}</dl>}
    {footer && <div className="pc-footer">{footer}</div>}
    {actions && <div className="pc-actions">{actions}</div>}
  </article>;
}

export function PersonList({ children, label }: { children: ReactNode; label: string }) {
  return <div className="pc-list" aria-label={label}>{children}</div>;
}
