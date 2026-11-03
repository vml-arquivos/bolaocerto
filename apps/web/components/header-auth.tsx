'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { homeForRole, isStaff } from '../lib/roles';

const HINT = 'bl-session-hint';
/** Chamado após o login para o cabeçalho passar a mostrar "Minha conta". */
export function rememberLogin() { try { localStorage.setItem(HINT, '1'); } catch { /* navegação privada */ } }

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
  if (role) return <Link className="button button-primary" href={role === 'cotista' ? '/minha-conta' : homeForRole(role)}>{isStaff(role) ? 'Painel' : role === 'afiliado' ? 'Minha área' : 'Minha conta'}</Link>;
  return <><Link className="button button-ghost" href="/login">Entrar</Link><Link className="button button-primary" href="/cadastro">Criar conta</Link></>;
}
