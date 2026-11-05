import { apiGet } from '../../lib/api';
import { PublicPool } from '../../lib/domain';
import { ClientFooter } from '../../components/client-footer';
import { PoolCarousel } from '../../components/pool-carousel';
import { LiveStorefront } from '../../components/live-storefront';
import { SiteHeader } from '../../components/site-header';
import { RoleLaunch } from '../../components/role-launch';
import { PushPrompt } from '../../components/push-prompt';
export const dynamic = 'force-dynamic';
export const metadata = { title: 'Bolões' };
export default async function ClientApp() {
  const result = await apiGet<PublicPool[]>('/boloes/disponiveis');
  return <><SiteHeader/><LiveStorefront/><RoleLaunch/><main className="shell client-app-home client-page" id="main-content"><PushPrompt audience="cliente" />
    <div className="account-app"><header className="account-top"><div><small>Bolão Livre</small><h1>Escolha seu bolão</h1></div></header>
    {result.error ? <div className="notice" role="status">Não foi possível consultar os bolões agora. Verifique sua conexão e tente novamente.</div> : <PoolCarousel pools={result.data ?? []} serverNow={Date.now()}/>}</div>
  </main><ClientFooter/></>;
}
