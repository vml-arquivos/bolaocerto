import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SiteFooter, SiteHeader } from '../../../components/site-header';
import { StatsDashboard } from '../../../components/stats-dashboard';
import { apiGet } from '../../../lib/api';
import { LotteryStats, StatsOverview } from '../../../lib/stats';

export async function generateMetadata({ params }: { params: Promise<{ modalidade: string }> }): Promise<Metadata> {
  const { modalidade } = await params;
  return { title: `Estatísticas · ${modalidade}` };
}

export default async function ModalityStatsPage({ params }: { params: Promise<{ modalidade: string }> }) {
  const { modalidade } = await params;
  const [stats, overview] = await Promise.all([apiGet<LotteryStats>(`/estatisticas/${encodeURIComponent(modalidade)}`), apiGet<StatsOverview>('/estatisticas')]);
  if (!stats.data) notFound();
  return <><SiteHeader /><main className="app-page" id="main-content"><div className="shell">
    <div className="breadcrumb"><Link href="/">Início</Link><span>/</span><Link href="/estatisticas">Estatísticas</Link><span>/</span><strong>{stats.data.nome}</strong></div>
    <div className="st-hero is-compact"><h1>{stats.data.nome}: estatísticas</h1><p>Histórico, frequência, atraso e probabilidades exatas.</p></div>
    <nav className="st-switch" aria-label="Modalidades">{(overview.data?.modalidades ?? []).map((item) => <Link key={item.modalidade} href={`/estatisticas/${item.modalidade}`} className={item.modalidade === modalidade ? 'is-on' : ''} aria-current={item.modalidade === modalidade ? 'page' : undefined}>{item.nome}</Link>)}</nav>
    <StatsDashboard stats={stats.data} />
  </div></main><SiteFooter /></>;
}
