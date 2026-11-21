'use client';
import type { ReactNode } from 'react';
import { initials } from './person-card';

/* Peças da ficha (cliente, afiliado): cabeçalho, números, blocos e lista de dados. Mesmo desenho no computador e no celular. */

export function FichaHead({ name, chips, lines }: { name: string; chips?: ReactNode; lines?: Array<ReactNode | null | undefined | false> }) {
  const shown = (lines ?? []).filter(Boolean);
  return <header className="ficha-head">
    <span className="ficha-avatar" aria-hidden="true">{initials(name)}</span>
    <div className="ficha-id">
      <strong>{name}</strong>
      {shown.length > 0 && <p>{shown.map((line, index) => <span key={index}>{line}</span>)}</p>}
      {chips && <div className="ficha-chips">{chips}</div>}
    </div>
  </header>;
}

export type FichaStat = { label: string; value: ReactNode; hint?: ReactNode; tone?: 'green' | 'amber' | 'rose' | 'blue' };

export function FichaStats({ items }: { items: FichaStat[] }) {
  return <dl className="ficha-stats">{items.map((item) => <div key={item.label} className={item.tone ? `is-${item.tone}` : undefined}>
    <dt>{item.label}</dt>
    <dd>{item.value}</dd>
    {item.hint && <small>{item.hint}</small>}
  </div>)}</dl>;
}

export function FichaGrid({ children }: { children: ReactNode }) {
  return <div className="ficha-grid">{children}</div>;
}

export function FichaSection({ title, action, children, wide }: { title: ReactNode; action?: ReactNode; children: ReactNode; wide?: boolean }) {
  return <section className={`ficha-section${wide ? ' is-wide' : ''}`}>
    <div className="ficha-section-head"><h3>{title}</h3>{action}</div>
    {children}
  </section>;
}

/** Lista de dados "rótulo: valor". Linhas sem valor mostram um traço. */
export function InfoList({ rows }: { rows: Array<[label: string, value: ReactNode]> }) {
  return <dl className="ficha-info">{rows.map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value === null || value === undefined || value === '' ? '—' : value}</dd></div>)}</dl>;
}

export function FichaEmpty({ text }: { text: string }) {
  return <p className="ficha-empty">{text}</p>;
}

export const KYC_TEXT: Record<string, string> = { nao_iniciado: 'Não iniciada', pendente: 'Em análise', aprovado: 'Aprovada', reprovado: 'Recusada' };

/** (61) 99999-8888 a partir só dos números. */
export function phoneText(value: unknown): string | null {
  const d = String(value ?? '').replace(/\D/g, '');
  if (d.length === 11) return `(${d.slice(0, 2)}) ${d.slice(2, 7)}-${d.slice(7)}`;
  if (d.length === 10) return `(${d.slice(0, 2)}) ${d.slice(2, 6)}-${d.slice(6)}`;
  return d || null;
}
