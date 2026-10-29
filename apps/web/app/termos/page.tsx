import { SiteFooter, SiteHeader } from '../../components/site-header';
import { LegalDocument } from '../../components/legal-document';
export const metadata = { title: 'Contrato de participação' };
export default function Page() { return <><SiteHeader/><main className="document-page shell" id="main-content"><h1>Contrato de participação</h1><LegalDocument kind="participacao"/></main><SiteFooter/></>; }
