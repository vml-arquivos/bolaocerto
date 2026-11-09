'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { ThemeToggle } from './theme-toggle';
import { InstallAppButton } from './pwa-register';
import { useIsSuperAdmin, useStaffRole } from './staff-gate';
import { PushPrompt } from './push-prompt';
import { STAFF_VIEWS, SUPERADMIN_VIEWS } from '../lib/roles';
import { hubOf, viewTitle } from '../lib/admin-nav';

/** Atalhos fixos no topo do menu. */
const topItems = [
  ['visao-geral', 'Resumo', 'RS'],
  ['relatorios', 'Relatórios', 'RL'],
] as const;

/** Grupos que abrem e fecham; só o grupo da tela atual fica aberto. Financeiro e Operação são itens únicos com abas. */
const groups = [
  {
    label: 'Jogos e vendas',
    items: [
      ['concursos', 'Concursos', 'CO'],
      ['boloes', 'Bolões', 'BO'],
    ],
  },
  {
    label: 'Pessoas',
    items: [
      ['crm', 'Clientes', 'CR'],
      ['afiliados', 'Afiliados', 'AF'],
      ['grupos', 'Grupos', 'GR'],
    ],
  },
  {
    label: 'Administração',
    items: [
      ['vitrine', 'Página inicial', 'PI'],
      ['usuarios', 'Usuários e acessos', 'US'],
      ['documentos', 'Documentos', 'DC'],
      ['funil', 'Funil de conversão', 'FC'],
      ['conexoes', 'Conexões', 'CX'],
      ['auditoria', 'Histórico', 'HI'],
      ['configuracoes', 'Configurações', 'CF'],
    ],
  },
] as const;

/** Itens únicos entre os grupos: cada um abre um painel com abas (ver lib/admin-nav). */
const hubItems = [
  ['financeiro', 'Financeiro', 'FN'],
  ['operacao', 'Operação', 'OP'],
] as const;

type NavItem = readonly [string, string, string];
const titles: Record<string, string> = Object.fromEntries([...(topItems as readonly NavItem[]), ...(hubItems as readonly NavItem[]), ...groups.flatMap((group) => group.items as readonly NavItem[])].map(([key, label]) => [key, label]));
const COLLAPSE_KEY = 'bl-admin-sidebar-collapsed';

export function AdminShell({ children, testMode = false }: { children: ReactNode; testMode?: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get('view') || 'visao-geral';
  // Telas que são abas de um mesmo item (Financeiro, Operação, Bolões) marcam o item do menu.
  const activeKey = hubOf(current)?.entry ?? current;
  const staffRole = useStaffRole();
  const allowed = (key: string) => staffRole !== 'operacao' || (STAFF_VIEWS as readonly string[]).includes(key);
  const visibleTop = topItems.filter(([key]) => allowed(key));
  const superAdmin = useIsSuperAdmin();
  const visibleGroups = staffRole === 'operacao'
    ? groups.map((group) => ({ ...group, items: group.items.filter(([key]) => (STAFF_VIEWS as readonly string[]).includes(key)) })).filter((group) => group.items.length)
    : superAdmin
      ? groups
      : groups.map((group) => ({ ...group, items: group.items.filter(([key]) => !(SUPERADMIN_VIEWS as readonly string[]).includes(key)) })).filter((group) => group.items.length);
  const visibleHubItems = hubItems.filter(([key]) => allowed(key));
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [tooltip, setTooltip] = useState<{ label: string; top: number } | null>(null);

  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1'); } catch { /* localStorage indisponível */ }
  }, []);

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      try { window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* localStorage indisponível */ }
      if (!next) setTooltip(null);
      return next;
    });
  }

  function showTooltip(label: string, target: HTMLElement) {
    if (!collapsed) return;
    const rect = target.getBoundingClientRect();
    setTooltip({ label, top: rect.top + rect.height / 2 });
  }
  function hideTooltip() {
    setTooltip(null);
  }

  function navLink(key: string, label: string, icon: string) {
    return (
      <Link
        key={key}
        href={`${pathname}?view=${key}`}
        className={`admin-nav-link ${activeKey === key ? 'is-active' : ''}`}
        onClick={() => setOpen(false)}
        onMouseEnter={(event) => showTooltip(label, event.currentTarget)}
        onMouseLeave={hideTooltip}
        onFocus={(event) => showTooltip(label, event.currentTarget)}
        onBlur={hideTooltip}
        aria-current={activeKey === key ? 'page' : undefined}
        data-label={label}
        title={collapsed ? label : undefined}
      >
        <span className="admin-nav-icon" aria-hidden="true">{icon}</span><span>{label}</span>
      </Link>
    );
  }

  return (
    <div className="admin-app">
      <a className="skip-link" href="#admin-main-content">Pular para o conteúdo</a>
      <aside className={`admin-sidebar ${open ? 'is-open' : ''} ${collapsed ? 'is-collapsed' : ''}`}>
        <div className="admin-brand">
          <span className="admin-brand-mark"><img src="/brand/bl-app-icon.png" alt="" aria-hidden="true" /></span>
          <span><strong>Bolão Livre</strong><small>Painel</small></span>
        </div>
        {testMode && <div className="admin-environment is-test-mode"><span className="admin-status-dot" /><span>Modo de teste</span></div>}
        {testMode && <p className="admin-environment-note">Não faça pagamentos de verdade.</p>}
        <nav className="admin-nav" aria-label="Menu do painel">
          {visibleTop.length > 0 && <div className="admin-nav-top">{visibleTop.map(([key, label, icon]) => navLink(key, label, icon))}</div>}
          {visibleGroups.filter((group) => group.label !== 'Administração').map((group) => (
            <details className="admin-nav-group" key={`${group.label}-${activeKey}-${collapsed}`} open={collapsed || group.items.some(([key]) => key === activeKey)}><summary className="admin-nav-label">{group.label}</summary>
              {group.items.map(([key, label, icon]) => navLink(key, label, icon))}
            </details>
          ))}
          <div className="admin-nav-top">{visibleHubItems.map(([key, label, icon]) => navLink(key, label, icon))}</div>
          {visibleGroups.filter((group) => group.label === 'Administração').map((group) => (
            <details className="admin-nav-group" key={`${group.label}-${activeKey}-${collapsed}`} open={collapsed || group.items.some(([key]) => key === activeKey)}><summary className="admin-nav-label">{group.label}</summary>
              {group.items.map(([key, label, icon]) => navLink(key, label, icon))}
            </details>
          ))}
        </nav>
        <button type="button" className="admin-collapse-toggle" onClick={toggleCollapsed} aria-pressed={collapsed} aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}>
          <span aria-hidden="true">{collapsed ? '»' : '«'}</span><span>{collapsed ? 'Expandir' : 'Recolher menu'}</span>
        </button>
        <div className="admin-sidebar-footer">
          <div className="admin-install"><InstallAppButton label="Instalar como app" hideWhenInstalled className="admin-install-link" /></div>
          <div className="admin-footer-links">
            <Link href="/minha-conta" className="admin-footer-link"><span>Minha conta</span></Link>
            <Link href="/" className="admin-footer-link"><span>Ver o site</span></Link>
          </div>
        </div>
      </aside>
      {collapsed && (
        <div
          className={`admin-sidebar-tooltip ${tooltip ? 'is-visible' : ''}`}
          style={tooltip ? { top: tooltip.top } : undefined}
          role="tooltip"
          aria-hidden={!tooltip}
        >
          {tooltip?.label}
        </div>
      )}
      {open && <button className="admin-overlay" aria-label="Fechar menu" onClick={() => setOpen(false)} />}
      <section className={`admin-content ${collapsed ? 'is-collapsed-content' : ''}`}>
        <header className="admin-topbar">
          <button type="button" className="admin-menu-toggle" onClick={() => setOpen((value) => !value)} aria-label="Abrir menu">Menu</button>
          <div className="admin-topbar-context"><span className="admin-eyebrow">Painel</span><strong>{viewTitle(current, titles[current] || 'Painel')}</strong></div>
          <div className="admin-topbar-actions">
            <ThemeToggle />
            <Link href="/" className="admin-topbar-link">Ver o site</Link>
          </div>
        </header>
        <main className="admin-main" id="admin-main-content"><PushPrompt audience="equipe" />{children}</main>
      </section>
    </div>
  );
}
