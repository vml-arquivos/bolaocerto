import type { Metadata } from 'next';
import { AuthPanel } from '../../components/auth-shell';
import { ForgotPasswordForm } from '../../components/password-forms';
export const metadata: Metadata = { title: 'Esqueci minha senha', robots: { index: false } };
export default function ForgotPasswordPage() { return <AuthPanel title="Esqueci minha senha" subtitle="Informe o e-mail da sua conta e enviaremos um link para criar uma nova senha."><ForgotPasswordForm /></AuthPanel>; }
