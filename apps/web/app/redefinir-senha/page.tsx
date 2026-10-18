import type { Metadata } from 'next';
import { AuthPanel } from '../../components/auth-shell';
import { ResetPasswordForm } from '../../components/password-forms';
export const metadata: Metadata = { title: 'Redefinir senha', robots: { index: false }, referrer: 'no-referrer' };
export default async function ResetPasswordPage({ searchParams }: { searchParams: Promise<{ token?: string | string[] }> }) {
  const { token } = await searchParams;
  return <AuthPanel title="Criar nova senha" subtitle="Escolha uma senha forte que você não usa em outros lugares."><ResetPasswordForm token={typeof token === 'string' ? token : ''} /></AuthPanel>;
}
