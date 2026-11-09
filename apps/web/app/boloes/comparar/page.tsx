import Link from 'next/link';
import { PoolCompare } from '../../../components/pool-compare';
import { SiteFooter, SiteHeader } from '../../../components/site-header';
import { apiGet } from '../../../lib/api';
import type { PublicPool } from '../../../lib/domain';
export const metadata = { title: 'Comparar bolões — Bolão Livre' };
export const dynamic = 'force-dynamic';

export default async function ComparePoolsPage() {
  const result = await apiGet<PublicPool[]>('/boloes/disponiveis');
  return <><SiteHeader /><main className="section shell" id="main-content"><h1>Comparar bolões abertos</h1><p>Veja lado a lado o valor da cota, a taxa de serviço, os jogos e as cotas livres.</p>
    {result.error ? <p role="alert">Não foi possível carregar os bolões agora. <Link href="/">Voltar ao início</Link></p> : <PoolCompare pools={result.data ?? []} />}
  </main><SiteFooter /></>;
}
