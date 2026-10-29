'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { ThemeToggle } from './theme-toggle';

const groups = [
  {
    label: 'Início',
    items: [
      ['visao-geral', 'Resumo', 'RS'],
    ],
  },
  {
    label: 'Jogos',
    items: [
      ['concursos', 'Concursos', 'CO'],
      ['boloes', 'Bolões', 'BO'],
      ['jogos', 'Apostas', 'JG'],
      ['cotas', 'Cotas', 'CT'],
      ['controle', 'Acompanhar bolão', 'CB'],
    ],
  },
  {
    label: 'Pessoas',
    items: [
      ['crm', 'Clientes', 'CR'],
      ['participantes', 'Participantes', 'PA'],
      ['grupos', 'Grupos', 'GR'],
    ],
  },
  {
    label: 'Indicações',
    items: [
      ['afiliados', 'Afiliados', 'AF'],
      ['rede', 'Quem indicou quem', 'RD'],
      ['convites', 'Convites', 'CV'],
      ['comissoes', 'Comissões', 'CM'],
      ['repasses', 'Pagar comissões', 'RP'],
    ],
  },
  {
    label: 'Dinheiro',
    items: [
      ['relatorios', 'Relatórios', 'RL'],
      ['recebimentos', 'Recebimentos', 'RE'],
      ['pagamentos', 'Pagamentos', 'PG'],
      ['notas-fiscais', 'Notas fiscais', 'NF'],
    ],
  },
  {
    label: 'Operação e comprovantes',
    items: [
      ['operacao', 'Para fazer', 'OP'],
      ['comprovantes', 'Comprovantes', 'CP'],
      ['lotericas', 'Lotéricas', 'LP'],
    ],
  },
  {
    label: 'Conta e acesso',
    items: [
      ['usuarios', 'Usuários e acessos', 'US'],
      ['conexoes', 'Conexões', 'CX'],
      ['auditoria', 'Histórico', 'HI'],
      ['configuracoes', 'Configurações', 'CF'],
    ],
  },
] as const;

const titles: Record<string, string> = Object.fromEntries(groups.flatMap((group) => group.items.map(([key, label]) => [key, label])));
const COLLAPSE_KEY = 'bl-admin-sidebar-collapsed';

export function AdminShell({ children, testMode = false }: { children: ReactNode; testMode?: boolean }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get('view') || 'visao-geral';
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
          {groups.map((group) => (
            <details className="admin-nav-group" key={`${group.label}-${current}-${collapsed}`} open={collapsed || group.items.some(([key]) => key === current)}><summary className="admin-nav-label">{group.label}</summary>
              {group.items.map(([key, label, icon]) => (
                <Link
                  key={key}
                  href={`${pathname}?view=${key}`}
                  className={`admin-nav-link ${current === key ? 'is-active' : ''}`}
                  onClick={() => setOpen(false)}
                  onMouseEnter={(event) => showTooltip(label, event.currentTarget)}
                  onMouseLeave={hideTooltip}
                  onFocus={(event) => showTooltip(label, event.currentTarget)}
                  onBlur={hideTooltip}
                  aria-current={current === key ? 'page' : undefined}
                  data-label={label}
                  title={collapsed ? label : undefined}
                >
                  <span className="admin-nav-icon" aria-hidden="true">{icon}</span><span>{label}</span>
                </Link>
              ))}
            </details>
          ))}
        </nav>
        <button type="button" className="admin-collapse-toggle" onClick={toggleCollapsed} aria-pressed={collapsed} aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}>
          <span aria-hidden="true">{collapsed ? '»' : '«'}</span><span>{collapsed ? 'Expandir' : 'Recolher menu'}</span>
        </button>
        <div className="admin-sidebar-footer">
          <Link href="/" className="admin-footer-link"><span>Voltar ao site</span></Link>
          <Link href="/minha-conta" className="admin-footer-link"><span>Minha conta</span></Link>
          <span className="admin-footer-note">BL — Bolão Livre</span>
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
          <div className="admin-topbar-context"><span className="admin-eyebrow">Painel</span><strong>{titles[current] || 'Painel'}</strong></div>
          <div className="admin-topbar-actions">
            <ThemeToggle />
            <Link href="/" className="admin-topbar-link">Ver o site</Link>
          </div>
        </header>
        <main className="admin-main" id="admin-main-content">{children}</main>
      </section>
    </div>
  );
}
