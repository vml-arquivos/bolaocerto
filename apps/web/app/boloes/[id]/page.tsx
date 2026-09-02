import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { PurchaseForm } from '../../../components/purchase-form';
import { SiteFooter, SiteHeader } from '../../../components/site-header';
import { apiGet } from '../../../lib/api';
import { modalityNames, money, PublicPool, shortDate } from '../../../lib/domain';

export const metadata: Metadata = { title: 'Detalhes do bolão' };
export default async function PoolPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const result = await apiGet<PublicPool>(`/boloes/${id}`);
  if (!result.data) notFound();
  const pool = result.data;
  const paymentsEnabled = process.env.PLATFORM_PAYMENTS_ENABLED === 'true';
  return <><SiteHeader/><main className="app-page"><div className="shell"><div className="page-heading"><div><span className="overline">{modalityNames[pool.concurso?.modalidade ?? ''] ?? 'Concurso oficial'}</span><h1>{pool.grupo?.nome ?? 'Bolão BL'}</h1><p className="muted">Concurso {pool.concurso?.numeroConcurso ?? '—'} · sorteio {shortDate(pool.concurso?.dataSorteio)}</p></div><span className="tag">{pool.status}</span></div><div className="detail-grid"><section className="detail-main"><div className="pool-prize"><span>Prêmio estimado do concurso</span><strong>{money(pool.concurso?.valorEstimadoPremio)}</strong></div><h2>Informações da participação</h2><p>{pool.grupo?.descricao ?? 'Participação vinculada ao concurso e administrada pelo BL — Bolão Livre.'}</p><div className="detail-facts"><div><small>Total de cotas</small><strong>{pool.totalCotas}</strong></div><div><small>Cotas disponíveis</small><strong>{pool.cotasDisponiveis}</strong></div><div><small>Taxa administrativa</small><strong>{pool.taxaAdministracaoPct}%</strong></div><div><small>Modelo operacional</small><strong>{pool.modeloOperacional === 'mandato' ? 'Mandato' : 'Lotérica parceira'}</strong></div></div><h2>Números do bolão</h2><div className="number-grid">{pool.numerosApostados.map((number, index) => <span className="number-ball" key={`${number}-${index}`}>{String(number).padStart(2,'0')}</span>)}</div><div className="notice transparency"><strong>Transparência antes da compra</strong><span>O valor, a taxa, a disponibilidade e o modelo de operação são apresentados antes da reserva. O comprovante é liberado conforme o registro operacional.</span></div></section><PurchaseForm poolId={pool.id} available={pool.cotasDisponiveis} unitPrice={pool.valorCota} status={pool.status} paymentsEnabled={paymentsEnabled}/></div></div></main><SiteFooter/></>;
}
