import { SiteFooter, SiteHeader } from '../../components/site-header';
import { LegalDocument } from '../../components/legal-document';
export const metadata = { title: 'Contrato de afiliação' };
export default function Page() { return <><SiteHeader/><main className="document-page shell" id="main-content"><h1>Contrato de afiliação</h1><LegalDocument kind="afiliado"/></main><SiteFooter/></>; }
