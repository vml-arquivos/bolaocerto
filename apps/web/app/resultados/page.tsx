import Link from 'next/link';
import { LiveStorefront } from '../../components/live-storefront';
import { PoolHistory } from '../../components/pool-history';
import { SiteHeader, SiteFooter } from '../../components/site-header';
import { apiGet } from '../../lib/api';
import { PublicPool } from '../../lib/domain';
import { ResultsTabs } from '../../components/results-tabs';
import { GameChecker } from '../../components/game-checker';
import { ResultGroup } from '../../lib/home';
export const metadata = { title: 'Resultados e histórico — Bolão Livre' };
export default async function ResultsPage() {
  const [result, official] = await Promise.all([apiGet<PublicPool[]>('/boloes/historico'), apiGet<ResultGroup[]>('/resultados/ultimos?porModalidade=20')]);
  return <><SiteHeader /><LiveStorefront /><main className="section shell" id="main-content"><h1>Resultados e histórico</h1><h2>Resultados oficiais</h2>{official.error ? <p role="status">Resultados oficiais temporariamente indisponíveis.</p> : <ResultsTabs groups={official.data ?? []} />}<GameChecker /><h2>Bolões com vendas encerradas</h2><p>Últimos 50 bolões com vendas encerradas. Suas participações anteriores continuam em <Link href="/minha-conta">Minha conta</Link>.</p><p><Link className="text-link" href="/#boloes">Ver bolões disponíveis para compra</Link></p>{result.error ? <p role="alert">Histórico temporariamente indisponível. Tente novamente.</p> : <PoolHistory pools={result.data ?? []} />}</main><SiteFooter /></>;
}
