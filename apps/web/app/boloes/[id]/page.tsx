import { splitQuota } from '../../../lib/home';
import { LiveStorefront } from '../../../components/live-storefront';
import { PoolHistory } from '../../../components/pool-history';
import { canPurchase, saleRuleState, withinSaleWindow } from '../../../lib/pool-availability';
import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LotteryArtwork } from '../../../components/lottery-artwork';
import { PoolTransparency } from '../../../components/pool-transparency';
import { PoolNumbers } from '../../../components/pool-numbers';
import { PoolExtraInfo } from '../../../components/pool-extra-info';
import { PurchaseForm } from '../../../components/purchase-form';
import { FunnelBeacon } from '../../../components/funnel-beacon';
import { SharePool } from '../../../components/share-pool';
import { SiteHeader } from '../../../components/site-header';
import { ClientFooter } from '../../../components/client-footer';
import { apiGet } from '../../../lib/api';
import { lotteryVisual } from '../../../lib/lottery-config';
import { modalityNames, money, PublicPool, shortDate } from '../../../lib/domain';
import { contestLabel } from '../../../lib/contest';

/** Título e descrição da prévia que aparece quando o link do bolão é compartilhado (WhatsApp, redes). */
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  const result = await apiGet<PublicPool>(`/boloes/${id}`);
  const pool = result.data;
  if (!pool) return { title: 'Detalhes do bolão' };
  const name = modalityNames[pool.concurso?.modalidade ?? ''] ?? 'Bolão';
  const title = `${name} · ${contestLabel(pool.concurso)} · cota de ${money(pool.valorCota)}`;
  const description = `Participe do bolão ${pool.grupo?.nome ?? 'BL'} no Bolão Livre. Sorteio em ${shortDate(pool.concurso?.dataSorteio)}.`;
  return { title, description, openGraph: { title, description, type: 'website', siteName: 'Bolão Livre' }, twitter: { card: 'summary', title, description } };
}

export default async function PoolPage({ params }: { params: Promise<{ id: string }> }) {
  const now = Date.now();
  const { id } = await params;
  const result = await apiGet<PublicPool>(`/boloes/${id}`);
  if (!result.data) notFound();
  const pool = result.data;
  const paymentsEnabled = process.env.PLATFORM_PAYMENTS_ENABLED === 'true';
  const visual = lotteryVisual(pool.concurso?.modalidade);
  const unlimited = pool.cotasIlimitadas || pool.cotasDisponiveis === null;
  const sold = unlimited ? 0 : Math.max((pool.totalCotas ?? 0) - (pool.cotasDisponiveis ?? 0), 0);
  const progress = unlimited ? 0 : Math.min(100, Math.round((sold / Math.max(pool.totalCotas ?? 1, 1)) * 100));
  const locked = withinSaleWindow(pool, now) && Boolean(pool.liberacao?.condicional && !pool.liberacao.liberado);
  const isOpen = canPurchase(pool, now);
  const ruleState = saleRuleState(pool, now);
  // Preço livre grava a divisão por cota; no modelo antigo a divisão sai da taxa sobre o custo.
  const priced = pool.precificacao?.ticketPerShare !== undefined && pool.precificacao?.feePerShare !== undefined ? { bilhete: pool.precificacao.ticketPerShare / 100, taxa: pool.precificacao.feePerShare / 100, pct: Math.round(pool.precificacao.feePerShare / Math.max(pool.precificacao.quotaCents ?? 1, 1) * 10000) / 100 } : null;
  const quota = priced ?? splitQuota(pool.valorCota, pool.taxaAdministracaoPct);
  const games = (pool.jogos?.length ? pool.jogos : [{ id: 'unico', ordem: 1, numeros: pool.numerosApostados }]).filter((game) => game.numeros.length > 0);
  const settled = Boolean(pool.transparencia?.apuradoEm && pool.transparencia?.apuracao);
  const progressState = progress >= 100 ? 'is-full' : progress >= 85 ? 'is-high' : progress >= 40 ? 'is-mid' : 'is-low';

  return <><LiveStorefront /><FunnelBeacon name="bolao_visto" /><SiteHeader/><main className="app-page" id="main-content">
<div className="shell"><div className="breadcrumb"><Link href="/">Início</Link><span>/</span><Link href="/#boloes">Bolões</Link><span>/</span><strong>{modalityNames[pool.concurso?.modalidade ?? ''] ?? 'Detalhes'}</strong></div>
<section className="detail-hero"><LotteryArtwork modality={pool.concurso?.modalidade} compact /><div className="detail-hero-copy"><div className="detail-kicker"><span className="overline">{visual.eyebrow}</span><span className={`tag ${isOpen ? 'tag-open' : 'tag-closed'}`}>{isOpen ? 'Cotas abertas' : locked ? 'Aguardando prêmio' : withinSaleWindow(pool, now) && ruleState === 'em_breve' ? 'Venda em breve' : 'Encerrado'}</span></div><h1>{pool.grupo?.nome ?? 'Bolão BL'}</h1><p className="detail-subtitle">{modalityNames[pool.concurso?.modalidade ?? ''] ?? 'Concurso oficial'} <span>•</span> {contestLabel(pool.concurso)} <span>•</span> sorteio {shortDate(pool.concurso?.dataSorteio)}</p>{pool.grupo?.descricao && <p>{pool.grupo.descricao}</p>}<SharePool poolId={pool.id} title={`${modalityNames[pool.concurso?.modalidade ?? ''] ?? 'Bolão'} · ${pool.grupo?.nome ?? 'BL'}`} detail={`${contestLabel(pool.concurso)}, sorteio ${shortDate(pool.concurso?.dataSorteio)}`} price={money(pool.valorCota)} /></div></section>
<div className="detail-grid"><section className="detail-main">
{pool.concurso?.valorEstimadoPremio && <div className="detail-prize-banner"><span>Prêmio estimado</span><strong>{money(pool.concurso?.valorEstimadoPremio)}</strong>{pool.concurso?.acumulado && <small>Acumulado para o próximo concurso</small>}</div>}
<div className="detail-quick"><div><small>Valor por cota</small><strong>{money(pool.valorCota)}</strong></div><div><small>Cotas livres</small><strong>{unlimited ? 'Ilimitadas' : `${pool.cotasDisponiveis} de ${pool.totalCotas}`}</strong></div></div>
{!unlimited && <div className={`detail-progress progress-block ${progressState}`}><div className="progress" aria-label={`${progress}% das cotas preenchidas`}><i style={{ width: `${progress}%` }} /></div></div>}
{games.length === 0
  ? <div className="detail-numbers-later" role="note"><strong>Os números deste bolão ainda não foram definidos</strong><p>{pool.precificacao?.jogosPrevistos ? `Serão ${pool.precificacao.jogosPrevistos} ${pool.precificacao.jogosPrevistos === 1 ? 'jogo' : 'jogos'}${pool.precificacao.dezenasPrevistas ? ` de ${pool.precificacao.dezenasPrevistas} números` : ''}. ` : ''}Os jogos são informados aqui antes do fechamento das apostas, e quem comprou cota é avisado. O comprovante do registro é enviado depois.</p></div>
  : <PoolNumbers games={games.map((game) => ({ ordem: game.ordem, numeros: game.numeros }))} name={pool.grupo?.nome ?? 'Bolão BL'} />}
{!['loteca', 'supersete'].includes(pool.concurso?.modalidade ?? '') && pool.concurso?.modalidade && <p className="muted"><Link className="text-link" href={`/estatisticas/${pool.concurso.modalidade}`}>Ver estatísticas de {modalityNames[pool.concurso.modalidade] ?? 'esta modalidade'}</Link></p>}
{pool.transparencia && <details className="pool-follow" open={settled}><summary>Acompanhar este bolão</summary><PoolTransparency pool={pool} /></details>}
{!withinSaleWindow(pool, now) && <PoolHistory pools={[pool]} />}
<PoolExtraInfo unitPrice={pool.valorCota} ticket={quota ? quota.bilhete : null} fee={quota ? quota.taxa : null} feePct={quota ? quota.pct : null} operation={pool.modeloOperacional} />
</section>
<PurchaseForm serverNow={now} cutoffAt={pool.concurso?.cutoffAt} contestStatus={pool.concurso?.status} hasResult={Boolean(pool.resultado)} poolId={pool.id} available={pool.cotasDisponiveis} unitPrice={pool.valorCota} status={pool.status} paymentsEnabled={paymentsEnabled} release={pool.liberacao} rules={pool.regrasVenda}/>
</div></div></main><ClientFooter/></>;
}
