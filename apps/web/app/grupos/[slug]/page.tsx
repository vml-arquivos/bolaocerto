import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { GroupJoin } from '../../../components/group-join';
import { PoolCard } from '../../../components/pool-card';
import { SiteFooter, SiteHeader } from '../../../components/site-header';
import { apiGet } from '../../../lib/api';
import { PublicPool } from '../../../lib/domain';

export const metadata: Metadata = { title: 'Grupo' };

type PublicGroup = { id: string; nome: string; slug: string; descricao: string | null; totalMembros: number; boloes: PublicPool[] };

export default async function GroupPage({ params }: { params: Promise<{ slug: string }> }) {
  const now = Date.now();
  const { slug } = await params;
  const result = await apiGet<PublicGroup>(`/grupos/${encodeURIComponent(slug)}`);
  if (!result.data) notFound();
  const group = result.data;
  return <><SiteHeader /><main className="app-page" id="main-content"><div className="shell">
    <div className="breadcrumb"><Link href="/">Início</Link><span>/</span><strong>{group.nome}</strong></div>
    <section className="section-title"><div><span className="overline">Grupo</span><h1>{group.nome}</h1><p>{group.descricao ?? 'Grupo de participação nos bolões do BL.'}</p><p className="muted">{group.totalMembros} {group.totalMembros === 1 ? 'pessoa' : 'pessoas'} no grupo</p></div></section>
    <GroupJoin slug={group.slug} />
    <h2>Bolões do grupo</h2>
    {group.boloes.length ? <div className="pool-grid">{group.boloes.map((pool) => <PoolCard key={pool.id} pool={pool} now={now} />)}</div> : <p className="muted">Este grupo ainda não tem bolões abertos.</p>}
  </div></main><SiteFooter /></>;
}
