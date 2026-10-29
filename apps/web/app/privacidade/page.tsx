import { SiteFooter, SiteHeader } from '../../components/site-header';
import { LegalDocument } from '../../components/legal-document';
export const metadata = { title: 'Política de privacidade' };
export default function Page() { return <><SiteHeader/><main className="document-page shell" id="main-content"><h1>Política de privacidade</h1><LegalDocument kind="privacidade"/></main><SiteFooter/></>; }
