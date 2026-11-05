import { Suspense } from 'react';
import type { Metadata } from 'next';
import { AccountDashboard } from '../../components/account-dashboard';
import { ClientFooter } from '../../components/client-footer';
import { SiteHeader } from '../../components/site-header';
export const metadata: Metadata = { title: 'Minhas cotas' };
export default function AccountPage(){ return <><SiteHeader/><main className="app-page client-page" id="main-content"><div className="shell"><Suspense fallback={<div className="empty-state"><span>BL</span><h3>Carregando sua conta…</h3></div>}><AccountDashboard/></Suspense></div></main><ClientFooter/></>; }
