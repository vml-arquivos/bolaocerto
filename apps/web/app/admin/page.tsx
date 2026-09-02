import type { Metadata } from 'next';
import { AdminDashboard } from '../../components/admin-dashboard';
import { SiteFooter, SiteHeader } from '../../components/site-header';
export const metadata: Metadata = { title: 'Administração' };
export default function AdminPage(){return <><SiteHeader/><main className="app-page"><div className="shell"><AdminDashboard/></div></main><SiteFooter/></>}
