import type { Metadata } from 'next';
import { SiteFooter, SiteHeader } from '../../../components/site-header';
import { DistributionAccept, type DistributionPreview } from '../../../components/distribution-accept';
import { apiGet } from '../../../lib/api';

export const metadata: Metadata = { title: 'Bolão para afiliado', robots: { index: false, follow: false } };

export default async function DistributionPage({ params }: { params: Promise<{ codigo: string }> }) {
  const { codigo } = await params;
  const result = await apiGet<DistributionPreview>(`/bolao-distribuicao/${encodeURIComponent(codigo)}`);
  const preview = result.data ?? { valido: false as const };
  return <><SiteHeader /><main className="app-page" id="main-content"><div className="shell" style={{ maxWidth: 640 }}>
    <DistributionAccept codigo={codigo} preview={preview} />
  </div></main><SiteFooter /></>;
}
