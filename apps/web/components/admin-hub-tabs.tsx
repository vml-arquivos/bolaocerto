'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { hubOf } from '../lib/admin-nav';
import { useCanOpen } from './staff-gate';

/** Abas do item do menu em que a tela está (Bolões, Financeiro, Operação). Some quando a tela não pertence a nenhum grupo. */
export function AdminHubTabs({ view }: { view: string }) {
  const pathname = usePathname();
  const canOpen = useCanOpen();
  const hub = hubOf(view);
  if (!hub) return null;
  const tabs = hub.tabs.filter(([key]) => canOpen(key));
  if (tabs.length < 2) return null;
  const current = hub.aliases?.includes(view) ? (hub.tabs.find(([key]) => key === 'recebimentos')?.[0] ?? view) : view;
  return <nav className="admin-hub-tabs report-tabs" aria-label={`Abas de ${hub.label}`}>{tabs.map(([key, label]) => <Link key={key} href={`${pathname}?view=${key}`} className={`report-tab ${current === key ? 'is-current' : ''}`} aria-current={current === key ? 'page' : undefined}>{label}</Link>)}</nav>;
}
