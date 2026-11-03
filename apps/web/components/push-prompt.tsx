'use client';
import { useEffect, useState } from 'react';
import { authenticatedFetch } from '../lib/client-api';
import { enablePush, readPushState, type PushState } from '../lib/push';

const DISMISS_KEY = 'bl-push-prompt-until';

/**
 * Convite para ligar os avisos no celular. Aparece só para quem já entrou, quando os avisos ainda
 * não foram ligados neste aparelho, e some por uma semana se a pessoa dispensar.
 */
export function PushPrompt({ audience = 'cliente' }: { audience?: 'cliente' | 'afiliado' | 'equipe' }) {
  const [state, setState] = useState<PushState>('checking');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let off = false;
    (async () => {
      try { if (Number(localStorage.getItem(DISMISS_KEY) ?? 0) > Date.now()) return; } catch { /* navegação privada */ }
      const status = await authenticatedFetch('/api/v1/push/status').catch(() => null);
      if (!status?.ok) return; // visitante: não mostra
      const next = await readPushState();
      if (!off) setState(next);
    })();
    return () => { off = true; };
  }, []);

  if (!['off', 'needs-install'].includes(state)) return null;
  const copy = {
    cliente: 'Pagamento confirmado, comprovante do seu jogo e resultado do bolão, direto na tela do celular.',
    afiliado: 'Venda confirmada, nova pessoa no seu grupo, bolão aprovado e comissão paga, na hora.',
    equipe: 'Bolões aguardando aprovação e pendências da operação, direto no celular.',
  }[audience];

  function dismiss() { try { localStorage.setItem(DISMISS_KEY, String(Date.now() + 7 * 86_400_000)); } catch { /* ok */ } setState('checking'); }
  async function turnOn() {
    setBusy(true); setMessage('');
    try {
      const next = await enablePush();
      if (next === 'on') { setMessage('Pronto! Os avisos estão ligados neste aparelho.'); setState('checking'); window.setTimeout(() => setMessage(''), 4000); }
      else setMessage(next === 'blocked' ? 'Os avisos estão bloqueados. Libere nas configurações do navegador (cadeado ao lado do endereço).' : 'Sem a sua permissão não dá para avisar.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não deu certo. Tente de novo.'); }
    finally { setBusy(false); }
  }

  return <aside className="push-prompt" role="region" aria-label="Avisos no celular">
    <span className="push-prompt-icon" aria-hidden="true">🔔</span>
    <div className="push-prompt-copy">
      <strong>Receba os avisos no celular</strong>
      <span>{state === 'needs-install' ? 'No iPhone, instale o app na tela de início (Compartilhar → Adicionar à Tela de Início) e abra por lá para ativar os avisos.' : copy}</span>
      {message && <small role="status">{message}</small>}
    </div>
    <div className="push-prompt-actions">
      {state === 'off' && <button type="button" className="button button-primary" disabled={busy} onClick={() => void turnOn()}>{busy ? 'Ligando…' : 'Ativar avisos'}</button>}
      <button type="button" className="button button-ghost" onClick={dismiss}>Agora não</button>
    </div>
  </aside>;
}
