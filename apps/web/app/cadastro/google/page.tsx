import type { Metadata } from 'next';
import { AuthPanel } from '../../../components/auth-shell';
import { GoogleSignupForm } from '../../../components/google-signup-form';
export const metadata: Metadata = { title: 'Concluir cadastro' };
export const dynamic = 'force-dynamic';

export default async function GoogleSignupPage({ searchParams }: { searchParams: Promise<{ convite?: string }> }) {
  const code = ((await searchParams).convite ?? '').trim().slice(0, 40);
  return <AuthPanel title="Quase lá" subtitle="Complete CPF e telefone para criar a sua conta com o Google."><GoogleSignupForm convite={code || null} /></AuthPanel>;
}
