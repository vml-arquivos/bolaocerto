import Link from 'next/link';
import { SiteHeader, SiteFooter } from '../../../components/site-header';
import { InstallAppButton } from '../../../components/pwa-register';
export const metadata = { title: 'Serviços do aplicativo' };
export default function AppMore() { return <><SiteHeader/><main className="shell document-page" id="main-content"><h1>Sua conta e seus documentos</h1><div className="client-menu-links"><Link href="/minha-conta">Conta, pagamentos, comprovantes e avisos</Link><Link href="/minha-conta/contratos">Meus contratos e aceites</Link><Link href="/resultados">Resultados e histórico</Link><Link href="/termos">Contrato de participação</Link><Link href="/privacidade">Política de privacidade</Link><Link href="/jogo-responsavel">Jogo responsável</Link><Link href="/login">Entrar na conta</Link><Link href="/instalar">Como instalar no Android e no iPhone</Link></div><InstallAppButton/></main><SiteFooter/></>; }
