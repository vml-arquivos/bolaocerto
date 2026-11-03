import type { Metadata } from 'next';
import { AuthShell } from '../../components/auth-shell';
import type { InviteView } from '../../components/auth-form';
import { apiGet } from '../../lib/api';
export const metadata: Metadata = { title: 'Criar conta' };
export const dynamic = 'force-dynamic';

type Info = { valido: boolean; tipo?: InviteView['tipo']; convidadoPor?: string | null; email?: string | null; grupo?: string | null; comissaoPct?: string | null; contrato?: InviteView['contrato'] };

export default async function RegisterPage({ searchParams }: { searchParams: Promise<{ convite?: string }> }) {
  const code = ((await searchParams).convite ?? '').trim().slice(0, 40);
  let invite: InviteView | null = null;
  if (code) {
    const info = await apiGet<Info>(`/auth/convite/${encodeURIComponent(code)}`);
    if (info.data?.valido && info.data.tipo) invite = { codigo: code, tipo: info.data.tipo, convidadoPor: info.data.convidadoPor ?? null, email: info.data.email ?? null, grupo: info.data.grupo ?? null, comissaoPct: info.data.comissaoPct ?? null, contrato: info.data.contrato ?? null };
  }
  return <AuthShell mode="register" invite={invite} />;
}
