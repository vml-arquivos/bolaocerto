'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { homeForRole, isStaff } from '../lib/roles';

const HINT = 'bl-session-hint';
/** Chamado após o login para o cabeçalho passar a mostrar "Minha conta". */
export function rememberLogin() { try { localStorage.setItem(HINT, '1'); localStorage.setItem('bl-last-activity', String(Date.now())); localStorage.setItem('bl-last-refresh', String(Date.now())); } catch { /* navegação privada */ } }

/** Entrar / Criar conta para visitantes; "Minha conta" (ou "Painel") para quem já entrou. */
export function HeaderAuth() {
  const [role, setRole] = useState<string | null>(null);
  useEffect(() => {
    let hint = false;
    try { hint = localStorage.getItem(HINT) === '1'; } catch { /* navegação privada */ }
    if (!hint) return;
    let off = false;
    fetch('/api/v1/auth/me', { credentials: 'include', cache: 'no-store' })
      .then(response => response.ok ? response.json() : Promise.reject(new Error('anon')))
      .then((user: { papel?: string }) => { if (!off) setRole(user.papel ?? 'cotista'); })
      .catch(() => { try { localStorage.removeItem(HINT); } catch { /* ok */ } });
    return () => { off = true; };
  }, []);
  async function logout() {
    await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
    try { localStorage.removeItem(HINT); } catch { /* ok */ }
    window.location.href = '/';
  }
  if (role) return <><Link className="button button-primary" href={role === 'cotista' ? '/minha-conta' : homeForRole(role)}>{isStaff(role) ? 'Painel' : role === 'afiliado' ? 'Minha área' : 'Minha conta'}</Link><button type="button" className="button button-ghost header-logout" onClick={() => void logout()}>Sair</button></>;
  return <><Link className="button button-ghost" href="/login">Entrar</Link><Link className="button button-primary" href="/cadastro">Criar conta</Link></>;
}
