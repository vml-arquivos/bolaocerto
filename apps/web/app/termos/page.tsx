import { SiteFooter, SiteHeader } from '../../components/site-header';
import { LegalDocument } from '../../components/legal-document';
export const metadata = { title: 'Termos de uso' };
export default function Page() { return <><SiteHeader/><main className="document-page shell" id="main-content"><h1>Termos de uso</h1><LegalDocument kind="termos"/></main><SiteFooter/></>; }
