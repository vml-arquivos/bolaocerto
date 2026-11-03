'use client';
import Link from 'next/link';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { homeForRole, isStaff, roleLabels, STAFF_VIEWS } from '../lib/roles';

const StaffRoleContext = createContext<'admin' | 'operacao'>('admin');
export const useStaffRole = () => useContext(StaffRoleContext);

/**
 * Confere quem está no painel: administrador vê tudo; equipe de operação só a tela "Para fazer";
 * cliente e afiliado são mandados para a própria área.
 */
export function StaffGate({ children }: { children: ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const view = params.get('view') || 'visao-geral';
  const [role, setRole] = useState<string | null>(null);

  useEffect(() => {
    let off = false;
    (async () => {
      let response = await fetch('/api/v1/auth/me', { credentials: 'include', cache: 'no-store' });
      if (response.status === 401) {
        const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
        if (refresh.ok) response = await fetch('/api/v1/auth/me', { credentials: 'include', cache: 'no-store' });
      }
      if (response.status === 401) { window.location.href = '/admin/entrar'; return; }
      const user = response.ok ? await response.json() as { papel?: string } : null;
      if (!off) setRole(user?.papel ?? 'cotista');
    })().catch(() => { if (!off) setRole('erro'); });
    return () => { off = true; };
  }, []);

  useEffect(() => {
    if (role === 'operacao' && !(STAFF_VIEWS as readonly string[]).includes(view)) router.replace(`${pathname}?view=${STAFF_VIEWS[0]}`);
  }, [role, view, pathname, router]);

  if (role === null) return <div className="admin-loading"><p>Conferindo seu acesso…</p></div>;
  if (role === 'erro') return <div className="admin-loading"><p>Não foi possível conferir seu acesso. Atualize a página.</p></div>;
  if (!isStaff(role)) {
    return <div className="admin-loading"><div className="notice" role="alert"><strong>Esta conta não é da equipe</strong><span>Seu perfil é {roleLabels[role] ?? role}. O painel é só para administradores e equipe.</span><Link className="button button-primary" href={homeForRole(role)}>Ir para a minha área</Link></div></div>;
  }
  if (role === 'operacao' && !(STAFF_VIEWS as readonly string[]).includes(view)) return <div className="admin-loading"><p>Abrindo a sua área…</p></div>;
  return <StaffRoleContext.Provider value={role as 'admin' | 'operacao'}>{children}</StaffRoleContext.Provider>;
}
