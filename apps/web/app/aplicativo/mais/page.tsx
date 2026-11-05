import Link from 'next/link';
import { ClientFooter } from '../../../components/client-footer';
import { SiteHeader } from '../../../components/site-header';
import { InstallAppButton } from '../../../components/pwa-register';
export const metadata = { title: 'Mais' };
const links: Array<[string, string, string]> = [
  ['/minha-conta?aba=conta', 'Minha conta', 'Dados, avisos, limite de gastos e senha'],
  ['/minha-conta/contratos', 'Contratos e aceites', 'Os contratos que você aceitou'],
  ['/resultados', 'Resultados', 'Concursos e histórico'],
  ['/termos', 'Contrato de participação', 'Leia antes de comprar'],
  ['/privacidade', 'Privacidade', 'Como cuidamos dos seus dados'],
  ['/jogo-responsavel', 'Jogo responsável', 'Limites e ajuda'],
  ['/instalar', 'Instalar no celular', 'Android e iPhone'],
];
export default function AppMore() {
  return <><SiteHeader/><main className="shell client-page" id="main-content"><div className="account-app"><header className="account-top"><div><small>Aplicativo</small><h1>Mais</h1></div></header>
    <nav className="app-rows" aria-label="Mais opções">{links.map(([href, title, hint]) => <Link key={href} className="app-row-link" href={href}><span><strong>{title}</strong><small>{hint}</small></span><span aria-hidden="true">›</span></Link>)}<Link className="app-row-link" href="/login"><span><strong>Entrar na conta</strong><small>Se você saiu ou trocou de aparelho</small></span><span aria-hidden="true">›</span></Link></nav>
    <InstallAppButton/></div></main><ClientFooter/></>;
}
