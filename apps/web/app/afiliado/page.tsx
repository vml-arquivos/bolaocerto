import type { Metadata } from 'next';
import { Suspense } from 'react';
import { SiteFooter, SiteHeader } from '../../components/site-header';
import { AffiliateDashboard } from '../../components/affiliate-dashboard';

export const metadata: Metadata = {
  title: 'Área do afiliado | BL — Bolão Livre',
  description: 'Acompanhe seu link, cotas atribuídas e comissões no BL.',
};

export default function AffiliatePage() {
  return <><SiteHeader /><main className="app-page" id="main-content"><div className="shell"><Suspense fallback={<div className="empty-state"><h3>Carregando área do afiliado…</h3></div>}><AffiliateDashboard /></Suspense></div></main><SiteFooter /></>;
}
