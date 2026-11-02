'use client';

import { useEffect, useState } from 'react';

/** Botão de entrar/sair do grupo. Quem não está logado vai para o login e volta aqui. */
export function GroupJoin({ slug }: { slug: string }) {
  const [state, setState] = useState<'loading' | 'anonymous' | 'out' | 'in'>('loading');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch(`/api/v1/grupos/${slug}/minha-participacao`, { credentials: 'include' })
      .then(async (response) => {
        if (response.status === 401 || response.status === 403) { setState('anonymous'); return; }
        const data = await response.json().catch(() => ({}));
        setState(data.membro ? 'in' : 'out');
      })
      .catch(() => setState('anonymous'));
  }, [slug]);

  async function change(join: boolean) {
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/v1/grupos/${slug}/${join ? 'entrar' : 'sair'}`, { method: join ? 'POST' : 'DELETE', credentials: 'include' });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'Não deu certo. Tente de novo.');
      setState(join ? 'in' : 'out');
      setMessage(join ? 'Pronto! Você agora faz parte do grupo.' : 'Você saiu do grupo.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não deu certo.'); }
    finally { setBusy(false); }
  }

  if (state === 'loading') return null;
  return <div className="group-page-actions">
    {state === 'anonymous' && <a className="button button-primary" href={`/login?next=/grupos/${slug}`}>Entrar para participar do grupo</a>}
    {state === 'out' && <button className="button button-primary" disabled={busy} onClick={() => void change(true)}>Participar do grupo</button>}
    {state === 'in' && <button className="button button-secondary" disabled={busy} onClick={() => void change(false)}>Sair do grupo</button>}
    {message && <span role="status" className="muted">{message}</span>}
  </div>;
}
