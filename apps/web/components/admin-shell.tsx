'use client';

import Link from 'next/link';
import { usePathname, useSearchParams } from 'next/navigation';
import { ReactNode, useState } from 'react';

const groups = [
  {
    label: 'Operação',
    items: [
      ['visao-geral', 'Visão geral', 'VG'],
      ['concursos', 'Concursos', 'CO'],
      ['boloes', 'Bolões', 'BO'],
      ['jogos', 'Jogos / apostas', 'JG'],
      ['cotas', 'Cotas', 'CT'],
      ['participantes', 'Participantes', 'PA'],
      ['operacao', 'Fila operacional', 'OP'],
      ['comprovantes', 'Comprovantes', 'CP'],
    ],
  },
  {
    label: 'Financeiro',
    items: [
      ['recebimentos', 'Recebimentos', 'RE'],
      ['pagamentos', 'Pagamentos', 'PG'],
      ['comissoes', 'Comissões', 'CM'],
      ['repasses', 'Repasses', 'RP'],
    ],
  },
  {
    label: 'Relacionamento',
    items: [
      ['afiliados', 'Afiliados', 'AF'],
      ['usuarios', 'Usuários', 'US'],
      ['lotericas', 'Lotéricas parceiras', 'LP'],
    ],
  },
  {
    label: 'Governança',
    items: [
      ['auditoria', 'Auditoria', 'AU'],
      ['configuracoes', 'Configurações', 'CF'],
    ],
  },
] as const;

const titles: Record<string, string> = Object.fromEntries(groups.flatMap((group) => group.items.map(([key, label]) => [key, label])));

export function AdminShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const params = useSearchParams();
  const current = params.get('view') || 'visao-geral';
  const [open, setOpen] = useState(false);

  return (
    <div className="admin-app">
      <aside className={`admin-sidebar ${open ? 'is-open' : ''}`}>
        <div className="admin-brand">
          <span className="admin-brand-mark"><img src="/brand/bl-app-icon.png" alt="" aria-hidden="true" /></span>
          <span><strong>Bolão Livre</strong><small>Central administrativa</small></span>
        </div>
        <div className="admin-environment"><span className="admin-status-dot" /> Ambiente de produção</div>
        <nav className="admin-nav" aria-label="Navegação administrativa">
          {groups.map((group) => (
            <div className="admin-nav-group" key={group.label}>
              <span className="admin-nav-label">{group.label}</span>
              {group.items.map(([key, label, icon]) => (
                <Link key={key} href={`${pathname}?view=${key}`} className={`admin-nav-link ${current === key ? 'is-active' : ''}`} onClick={() => setOpen(false)}>
                  <span className="admin-nav-icon">{icon}</span><span>{label}</span>
                </Link>
              ))}
            </div>
          ))}
        </nav>
        <div className="admin-sidebar-footer">
          <Link href="/" className="admin-footer-link">Voltar à vitrine</Link>
          <Link href="/minha-conta" className="admin-footer-link">Minha conta</Link>
          <span className="admin-footer-note">BL — Bolão Livre</span>
        </div>
      </aside>
      {open && <button className="admin-overlay" aria-label="Fechar menu" onClick={() => setOpen(false)} />}
      <section className="admin-content">
        <header className="admin-topbar">
          <button type="button" className="admin-menu-toggle" onClick={() => setOpen((value) => !value)} aria-label="Abrir menu administrativo">Menu</button>
          <div className="admin-topbar-context"><span className="admin-eyebrow">Centro de gestão</span><strong>{titles[current] || 'Administração'}</strong></div>
          <div className="admin-topbar-actions"><span className="admin-live-pill"><span className="admin-status-dot" /> Operação online</span><Link href="/" className="admin-topbar-link">Ver vitrine</Link></div>
        </header>
        <main className="admin-main">{children}</main>
      </section>
    </div>
  );
}
