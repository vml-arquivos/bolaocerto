import type { Metadata } from 'next';
import { Checkout } from '../../../components/checkout';
import { SiteFooter, SiteHeader } from '../../../components/site-header';

export const metadata: Metadata = { title: 'Pagamento', robots: { index: false } };

export default async function CheckoutPage({ params, searchParams }: { params: Promise<{ cotaId: string }>; searchParams: Promise<{ voltar?: string }> }) {
  const { cotaId } = await params;
  const { voltar } = await searchParams;
  return <><SiteHeader /><main className="app-page" id="main-content"><div className="shell"><Checkout shareId={cotaId} voltar={voltar} /></div></main><SiteFooter /></>;
}
