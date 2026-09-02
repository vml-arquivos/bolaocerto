'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ReactNode, useEffect, useState } from 'react';
import { ThemeToggle } from './theme-toggle';

const groups = [
  {
    label: 'Visão',
    items: [
      ['visao-geral', 'Visão geral', 'VG'],
    ],
  },
  {
    label: 'Loterias',
    items: [
      ['concursos', 'Concursos', 'CO'],
      ['boloes', 'Bolões', 'BO'],
      ['jogos', 'Jogos / apostas', 'JG'],
      ['cotas', 'Cotas', 'CT'],
    ],
  },
  {
    label: 'Clientes',
    items: [
      ['participantes', 'Participantes', 'PA'],
      ['grupos', 'Grupos', 'GR'],
    ],
  },
  {
    label: 'Rede',
    items: [
      ['afiliados', 'Afiliados', 'AF'],
      ['rede', 'Rede de afiliados', 'RD'],
      ['convites', 'Convites', 'CV'],
      ['comissoes', 'Comissões', 'CM'],
      ['repasses', 'Repasses', 'RP'],
    ],
  },
  {
    label: 'Financeiro',
    items: [
      ['recebimentos', 'Recebimentos', 'RE'],
      ['pagamentos', 'Pagamentos', 'PG'],
    ],
  },
  {
    label: 'Operação',
    items: [
      ['operacao', 'Fila operacional', 'OP'],
      ['comprovantes', 'Comprovantes', 'CP'],
      ['lotericas', 'Lotéricas parceiras', 'LP'],
    ],
  },
  {
    label: 'Sistema',
    items: [
      ['usuarios', 'Usuários', 'US'],
      ['auditoria', 'Auditoria', 'AU'],
      ['configuracoes', 'Configurações', 'CF'],
    ],
  },
] as const;

const titles: Record<string, string> = Object.fromEntries(groups.flatMap((group) => group.items.map(([key, label]) => [key, label])));
const COLLAPSE_KEY = 'bl-admin-sidebar-collapsed';

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get('view') || 'visao-geral';
  const [open, setOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    try { setCollapsed(window.localStorage.getItem(COLLAPSE_KEY) === '1'); } catch { /* localStorage indisponível */ }
  }, []);

  function toggleCollapsed() {
    setCollapsed((value) => {
      const next = !value;
      try { window.localStorage.setItem(COLLAPSE_KEY, next ? '1' : '0'); } catch { /* localStorage indisponível */ }
      return next;
    });
  }

  return (
    <div className="admin-app">
      <a className="skip-link" href="#admin-main-content">Pular para o conteúdo</a>
      <aside className={`admin-sidebar ${open ? 'is-open' : ''} ${collapsed ? 'is-collapsed' : ''}`}>
        <div className="admin-brand">
          <span className="admin-brand-mark"><img src="/brand/bl-app-icon.png" alt="" aria-hidden="true" /></span>
          <span><strong>Bolão Livre</strong><small>Central administrativa</small></span>
        </div>
        <div className="admin-environment"><span className="admin-status-dot" /> <span>Ambiente de produção</span></div>
        <nav className="admin-nav" aria-label="Navegação administrativa">
          {groups.map((group) => (
            <div className="admin-nav-group" key={group.label}>
              <span className="admin-nav-label">{group.label}</span>
              {group.items.map(([key, label, icon]) => (
                <Link
                  key={key}
                  href={`${pathname}?view=${key}`}
                  className={`admin-nav-link ${current === key ? 'is-active' : ''}`}
                  onClick={() => setOpen(false)}
                  aria-current={current === key ? 'page' : undefined}
                  data-label={label}
                >
                  <span className="admin-nav-icon" aria-hidden="true">{icon}</span><span>{label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <button type="button" className="admin-collapse-toggle" onClick={toggleCollapsed} aria-pressed={collapsed} aria-label={collapsed ? 'Expandir menu lateral' : 'Recolher menu lateral'}>
          <span aria-hidden="true">{collapsed ? '»' : '«'}</span><span>{collapsed ? 'Expandir' : 'Recolher menu'}</span>
        </button>
        <div className="admin-sidebar-footer">
          <Link href="/" className="admin-footer-link"><span>Voltar à vitrine</span></Link>
          <Link href="/minha-conta" className="admin-footer-link"><span>Minha conta</span></Link>
          <span className="admin-footer-note">BL — Bolão Livre</span>
        </div>
      </aside>
      {open && <button className="admin-overlay" aria-label="Fechar menu" onClick={() => setOpen(false)} />}
      <section className={`admin-content ${collapsed ? 'is-collapsed-content' : ''}`}>
        <header className="admin-topbar">
          <button type="button" className="admin-menu-toggle" onClick={() => setOpen((value) => !value)} aria-label="Abrir menu administrativo">Menu</button>
          <div className="admin-topbar-context"><span className="admin-eyebrow">Centro de gestão</span><strong>{titles[current] || 'Administração'}</strong></div>
          <div className="admin-topbar-actions">
            <span className="admin-live-pill"><span className="admin-status-dot" /> Operação online</span>
            <ThemeToggle />
            <Link href="/" className="admin-topbar-link">Ver vitrine</Link>
          </div>
        </header>
        <main className="admin-main" id="admin-main-content">{children}</main>
      </section>
    </div>
  );
}
