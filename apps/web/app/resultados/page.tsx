import Link from 'next/link';
import { LiveStorefront } from '../../components/live-storefront';
import { PoolHistory } from '../../components/pool-history';
import { SiteHeader, SiteFooter } from '../../components/site-header';
import { apiGet } from '../../lib/api';
import { PublicPool } from '../../lib/domain';
export const metadata = { title: 'Resultados e histórico — Bolão Livre' };
export default async function ResultsPage() {
  const result = await apiGet<PublicPool[]>('/boloes/historico');
  return <><SiteHeader /><LiveStorefront /><main className="section shell" id="main-content"><h1>Resultados e histórico</h1><p>Últimos 50 bolões com vendas encerradas. Suas participações anteriores continuam em <Link href="/minha-conta">Minha conta</Link>.</p><p><Link className="text-link" href="/#boloes">Ver bolões disponíveis para compra</Link></p>{result.error ? <p role="alert">Histórico temporariamente indisponível. Tente novamente.</p> : <PoolHistory pools={result.data ?? []} />}</main><SiteFooter /></>;
}
