import type { Metadata } from 'next';
import { AuthShell } from '../../../components/auth-shell';
import { InstallAppButton } from '../../../components/pwa-register';
export const metadata: Metadata = { title: 'Entrar no painel' };
export default function AdminLoginPage() {
  return <AuthShell mode="login" audience="admin" extra={<div className="install-admin-box"><strong>Painel como aplicativo</strong><p className="muted">Instale o BL Admin no celular ou no computador para abrir o painel com um toque, em tela cheia.</p><InstallAppButton label="Instalar o painel" /></div>} />;
}
