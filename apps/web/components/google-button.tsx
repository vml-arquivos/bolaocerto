'use client';
import { useEffect, useRef, useState } from 'react';
import { rememberLogin } from './header-auth';
import { landingFor } from '../lib/roles';

declare global {
  interface Window { google?: { accounts: { id: { initialize: (config: Record<string, unknown>) => void; renderButton: (el: HTMLElement, options: Record<string, unknown>) => void } } } }
}

export const GOOGLE_SIGNUP_KEY = 'bl_google_signup';

function loadGoogleScript(): Promise<void> {
  return new Promise((resolve, reject) => {
    if (window.google?.accounts?.id) { resolve(); return; }
    const existing = document.querySelector<HTMLScriptElement>('script[data-google-gsi]');
    const script = existing ?? Object.assign(document.createElement('script'), { src: 'https://accounts.google.com/gsi/client', async: true, defer: true });
    script.setAttribute('data-google-gsi', '1');
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('gsi')));
    if (!existing) document.head.appendChild(script);
  });
}

/** "Entrar com Google": só aparece quando a API tem o GOOGLE_CLIENT_ID configurado. Sem ele, não mostra nada. */
export function GoogleButton({ convite = null, mode = 'login' }: { convite?: string | null; mode?: 'login' | 'register' }) {
  const holder = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const config = await fetch('/api/v1/auth/google/config', { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)) as { ativo?: boolean; clientId?: string | null } | null;
        if (!config?.ativo || !config.clientId) return;
        await loadGoogleScript();
        if (cancelled || !window.google) return;
        setActive(true);
        window.google.accounts.id.initialize({
          client_id: config.clientId,
          callback: async (response: { credential?: string }) => {
            setMessage('');
            try {
              const result = await fetch('/api/v1/auth/google', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ credential: response.credential }) });
              const body = await result.json().catch(() => ({})) as { message?: string | string[]; user?: { papel?: string }; cadastroPendente?: boolean; token?: string; nome?: string; email?: string };
              if (!result.ok) throw new Error(Array.isArray(body.message) ? body.message.join(' ') : body.message || 'Não foi possível entrar com o Google.');
              if (body.cadastroPendente && body.token) {
                try { sessionStorage.setItem(GOOGLE_SIGNUP_KEY, JSON.stringify({ token: body.token, nome: body.nome ?? '', email: body.email ?? '' })); } catch { /* sem armazenamento */ }
                window.location.href = `/cadastro/google${convite ? `?convite=${encodeURIComponent(convite)}` : ''}`;
                return;
              }
              rememberLogin();
              window.location.href = landingFor(body.user?.papel, mode === 'login' ? new URLSearchParams(window.location.search).get('next') : null);
            } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro inesperado.'); }
          },
        });
        if (holder.current) window.google.accounts.id.renderButton(holder.current, { theme: 'outline', size: 'large', text: mode === 'register' ? 'signup_with' : 'signin_with', locale: 'pt-BR', width: 300 });
      } catch { /* sem Google: o login com e-mail e senha continua igual */ }
    })();
    return () => { cancelled = true; };
  }, [convite, mode]);

  return <div className="google-login" hidden={!active && !message}>
    <div className="google-login-sep" aria-hidden="true"><span>ou</span></div>
    <div ref={holder} className="google-login-button" />
    {message && <div className="form-message form-error" role="alert">{message}</div>}
  </div>;
}
