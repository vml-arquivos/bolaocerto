import { LegalHistory } from '../../../components/legal-history';
import { SiteFooter, SiteHeader } from '../../../components/site-header';
export const metadata = { title: 'Meus contratos' };
export default function Page() { return <><SiteHeader/><main className="document-page shell"><h1>Meus contratos e aceites</h1><LegalHistory/></main><SiteFooter/></>; }
