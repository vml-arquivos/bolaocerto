'use client';
import { useEffect } from 'react';
import { homeForRole } from '../lib/roles';

/**
 * Quando o app instalado abre (início com ?origem=pwa) e a pessoa já está logada com um papel que
 * não é de cliente, leva direto para a área dela. Visitante e cliente seguem na vitrine.
 */
export function RoleLaunch() {
  useEffect(() => {
    if (new URLSearchParams(window.location.search).get('origem') !== 'pwa') return;
    let hint = false;
    try { hint = localStorage.getItem('bl-session-hint') === '1'; } catch { /* navegação privada */ }
    if (!hint) return;
    let off = false;
    fetch('/api/v1/auth/me', { credentials: 'include', cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((user: { papel?: string } | null) => { if (!off && user?.papel && user.papel !== 'cotista') window.location.replace(homeForRole(user.papel)); })
      .catch(() => undefined);
    return () => { off = true; };
  }, []);
  return null;
}
