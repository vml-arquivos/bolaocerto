import type { Metadata } from 'next';
import { AuthShell } from '../../../components/auth-shell';
import { InstallAppButton } from '../../../components/pwa-register';
export const metadata: Metadata = { title: 'Entrar como afiliado' };
export default function AffiliateLoginPage() {
  return <AuthShell mode="login" audience="afiliado" extra={<div className="install-admin-box"><strong>Área do afiliado como aplicativo</strong><p className="muted">Instale o BL Afiliado no celular para abrir suas cotas, vendas e comissões com um toque, em tela cheia.</p><InstallAppButton label="Instalar o BL Afiliado" /></div>} />;
}
