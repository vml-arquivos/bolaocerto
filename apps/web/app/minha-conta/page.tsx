import Link from 'next/link';
import type { Metadata } from 'next';
import { AccountDashboard } from '../../components/account-dashboard';
import { SiteFooter, SiteHeader } from '../../components/site-header';
export const metadata: Metadata = { title: 'Minhas cotas' };
export default function AccountPage(){ return <><SiteHeader/><main className="app-page" id="main-content"><div className="shell"><nav className="account-subnav" aria-label="Atalhos da conta"><Link href="/minha-conta/contratos">Meus contratos e aceites</Link><Link href="/resultados">Resultados</Link><Link href="/aplicativo">Bolões</Link></nav><AccountDashboard/></div></main><SiteFooter/></>; }
