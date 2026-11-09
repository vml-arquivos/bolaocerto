'use client';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ReactNode } from 'react';
import { ThemeToggle } from './theme-toggle';
import { InstallAppButton } from './pwa-register';
import { ProfilePanel } from './profile-panel';

/** Abas do aplicativo do afiliado. A aba atual fica na URL (?aba=), então o botão voltar e os atalhos do app funcionam. */
export const AFFILIATE_TABS = [
  ['visao', 'Início', '⌂'],
  ['cotas', 'Cotas', '◉'],
  ['vendas', 'Vendas', '↗'],
  ['clientes', 'Clientes', '☰'],
  ['boloes', 'Bolões', '▦'],
  ['grupos', 'Grupos', '☺'],
  ['comissoes', 'Comissões', '$'],
] as const;
export type AffiliateTab = (typeof AFFILIATE_TABS)[number][0] | 'mais';

export function parseAffiliateTab(value: string | null | undefined): AffiliateTab {
  return value === 'mais' || AFFILIATE_TABS.some(([key]) => key === value) ? (value as AffiliateTab) : 'visao';
}

/** Barra de baixo do celular: as quatro telas do dia a dia e "Mais" (grupos, comissões e conta). */
const BOTTOM = [['visao', 'Início', '⌂'], ['cotas', 'Cotas', '◉'], ['vendas', 'Vendas', '↗'], ['clientes', 'Clientes', '☰'], ['boloes', 'Bolões', '▦'], ['mais', 'Mais', '•••']] as const;
const href = (tab: string) => (tab === 'visao' ? '/afiliado' : `/afiliado?aba=${tab}`);

async function logout() {
  await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
  window.location.href = '/afiliado/entrar';
}

/** Casca do aplicativo do afiliado: barra de cima, abas (computador) e barra de baixo (celular). */
export function AffiliateShell({ children }: { children: ReactNode }) {
  const tab = parseAffiliateTab(useSearchParams().get('aba'));
  const bottomActive = tab === 'grupos' || tab === 'comissoes' ? 'mais' : tab;
  return <div className="aff-app">
    <a className="skip-link" href="#afiliado-main">Pular para o conteúdo</a>
    <header className="aff-topbar">
      <Link className="aff-brand" href="/afiliado" aria-label="BL Afiliado, início"><span className="aff-brand-mark"><img src="/brand/bl-afiliado-icon-maskable-192.png" alt="" aria-hidden="true" /></span><span><strong>BL Afiliado</strong><small>Bolão Livre</small></span></Link>
      <nav className="aff-tabs" aria-label="Menu do afiliado">{AFFILIATE_TABS.map(([key, label]) => <Link key={key} href={href(key)} aria-current={tab === key ? 'page' : undefined}>{label}</Link>)}</nav>
      <div className="aff-actions"><ThemeToggle /><InstallAppButton label="Instalar app" hideWhenInstalled className="aff-install" /><button type="button" className="aff-logout" onClick={() => void logout()}>Sair</button></div>
    </header>
    <main className="aff-main" id="afiliado-main">{children}</main>
    <nav className="aff-bottomnav" aria-label="Navegação do aplicativo do afiliado">{BOTTOM.map(([key, label, icon]) => <Link key={key} href={href(key)} aria-current={bottomActive === key ? 'page' : undefined}><span aria-hidden="true">{icon}</span><span>{label}</span></Link>)}</nav>
  </div>;
}

/** Aba "Mais" (celular): o que não cabe na barra de baixo. */
export function AffiliateMore({ pending, status }: { pending: string; status?: string }) {
  return <section className="affiliate-table-card aff-more">
    <div className="affiliate-card-heading"><div><h2>Seu aplicativo</h2><p>Cadastro: <span className={`affiliate-status ${status}`}>{String(status ?? '—').replaceAll('_', ' ')}</span></p></div></div>
    <ProfilePanel pixLabel="Chave Pix para receber comissões" />
    <div className="aff-more-links">
      <Link href="/afiliado?aba=grupos"><strong>Grupos</strong><small>Pessoas, convites e páginas dos seus grupos.</small></Link>
      <Link href="/afiliado?aba=comissoes"><strong>Comissões</strong><small>Pendente: {pending}. Base, percentual e repasses.</small></Link>
      <Link href="/aplicativo"><strong>Comprar cotas</strong><small>Abre o app do cliente, com a mesma conta.</small></Link>
      <Link href="/minha-conta"><strong>Minha conta</strong><small>Dados, senha, avisos e contratos.</small></Link>
      <Link href="/instalar"><strong>Instalar os aplicativos</strong><small>Cliente, afiliado e equipe: cada um tem o seu.</small></Link>
    </div>
    <button type="button" className="button button-ghost" onClick={() => void logout()}>Sair deste aparelho</button>
  </section>;
}
