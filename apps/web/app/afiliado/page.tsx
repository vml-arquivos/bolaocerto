import { Suspense } from 'react';
import { AffiliateDashboard } from '../../components/affiliate-dashboard';
import { AffiliateShell } from '../../components/affiliate-shell';

// Aplicativo do afiliado: casca própria (menu embaixo no celular), sem o cabeçalho e o rodapé do site.
export default function AffiliatePage() {
  return <Suspense fallback={<div className="affiliate-loading">Abrindo o aplicativo do afiliado…</div>}><AffiliateShell><AffiliateDashboard /></AffiliateShell></Suspense>;
}
