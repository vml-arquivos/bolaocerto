'use client';
import Link from 'next/link';
import { createContext, ReactNode, useContext, useEffect, useState } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { homeForRole, isStaff, roleLabels } from '../lib/roles';
import { canOpenView, firstOpenView } from '../lib/access';

const StaffRoleContext = createContext<'admin' | 'operacao'>('admin');
export const useStaffRole = () => useContext(StaffRoleContext);
const SuperAdminContext = createContext(false);
/** Conta principal do sistema (e-mail de instalação): única que pode apagar grupos e pessoas sem movimentação. */
export const useIsSuperAdmin = () => useContext(SuperAdminContext);
/** Pode abrir esta tela do painel? (funções liberadas pela conta principal; sem personalização, a regra do perfil). */
const CanOpenContext = createContext<(view: string) => boolean>(() => true);
export const useCanOpen = () => useContext(CanOpenContext);

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
  const [superadmin, setSuperadmin] = useState(false);
  const [modules, setModules] = useState<string[] | null>(null);

  useEffect(() => {
    let off = false;
    (async () => {
      let response = await fetch('/api/v1/auth/me', { credentials: 'include', cache: 'no-store' });
      if (response.status === 401) {
        const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
        if (refresh.ok) response = await fetch('/api/v1/auth/me', { credentials: 'include', cache: 'no-store' });
      }
      if (response.status === 401) { window.location.href = '/admin/entrar'; return; }
      const user = response.ok ? await response.json() as { papel?: string; superadmin?: boolean; modulos?: string[] | null } : null;
      if (!off) { setSuperadmin(user?.superadmin === true); setModules(Array.isArray(user?.modulos) ? user!.modulos! : null); setRole(user?.papel ?? 'cotista'); }
    })().catch(() => { if (!off) setRole('erro'); });
    return () => { off = true; };
  }, []);

  const ctx = { role: role ?? '', superadmin, modules };
  const blocked = isStaff(role) && !canOpenView(view, ctx);
  const landing = isStaff(role) ? firstOpenView(ctx) : null;
  useEffect(() => {
    // Tela bloqueada (área da conta principal ou função tirada pela conta principal): vai para a primeira tela liberada.
    if (blocked && landing) router.replace(`${pathname}?view=${landing}`);
  }, [blocked, landing, pathname, router]);

  if (role === null) return <div className="admin-loading"><p>Conferindo seu acesso…</p></div>;
  if (role === 'erro') return <div className="admin-loading"><p>Não foi possível conferir seu acesso. Atualize a página.</p></div>;
  if (!isStaff(role)) {
    return <div className="admin-loading"><div className="notice" role="alert"><strong>Esta conta não é da equipe</strong><span>Seu perfil é {roleLabels[role] ?? role}. O painel é só para administradores e equipe.</span><Link className="button button-primary" href={homeForRole(role)}>Ir para a minha área</Link></div></div>;
  }
  if (blocked && !landing) return <div className="admin-loading"><div className="notice" role="alert"><strong>Nenhuma função liberada</strong><span>Seu acesso ao painel ainda não tem funções liberadas. Fale com o administrador principal.</span></div></div>;
  if (blocked) return <div className="admin-loading"><p>Esta função não está liberada para você. Abrindo a sua área…</p></div>;
  const canOpen = (target: string) => canOpenView(target, ctx);
  return <StaffRoleContext.Provider value={role as 'admin' | 'operacao'}><SuperAdminContext.Provider value={superadmin}><CanOpenContext.Provider value={canOpen}>{children}</CanOpenContext.Provider></SuperAdminContext.Provider></StaffRoleContext.Provider>;
}
