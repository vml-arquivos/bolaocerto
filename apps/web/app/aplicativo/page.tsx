import Link from 'next/link';
import { apiGet } from '../../lib/api';
import { PublicPool } from '../../lib/domain';
import { LotteryCatalog } from '../../components/lottery-catalog';
import { LiveStorefront } from '../../components/live-storefront';
import { SiteHeader, SiteFooter } from '../../components/site-header';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Aplicativo do cotista' };
export default async function ClientApp() {
  const result = await apiGet<PublicPool[]>('/boloes/disponiveis');
  return <><SiteHeader/><LiveStorefront/><main className="shell client-app-home" id="main-content"><span className="overline">Seu Bolão Livre</span><h1>Escolha seu próximo bolão</h1><p>Veja os jogos, o preço e o comprovante. Sua participação fica registrada na sua conta.</p><div className="client-quick-links"><Link href="/minha-conta">Minhas cotas e pagamentos</Link><Link href="/resultados">Resultados dos concursos</Link><Link href="/instalar">Instalar no celular</Link></div>{result.error ? <div className="notice" role="status">Não foi possível consultar os bolões agora. Verifique sua conexão e tente novamente.</div> : <LotteryCatalog pools={result.data ?? []} serverNow={Date.now()}/>}<p className="muted">Acesso para maiores de 18 anos. O BL é independente da CAIXA. Leia os jogos, custos e condições antes de comprar.</p></main><SiteFooter/></>;
}
