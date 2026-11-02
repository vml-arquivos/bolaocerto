'use client';
import { useEffect, useState } from 'react';
import { authenticatedFetch } from '../lib/client-api';

function toKey(base64: string) {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=').replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

/** Liga ou desliga os avisos no celular/computador (PWA). Cada aparelho decide por si. */
export function PushToggle() {
  const [state, setState] = useState<'checking' | 'unsupported' | 'blocked' | 'off' | 'on'>('checking');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    (async () => {
      if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window) || !window.isSecureContext) { if (!cancelled) setState('unsupported'); return; }
      if (Notification.permission === 'denied') { if (!cancelled) setState('blocked'); return; }
      try {
        const registration = await navigator.serviceWorker.ready;
        const existing = await registration.pushManager.getSubscription();
        if (!cancelled) setState(existing && Notification.permission === 'granted' ? 'on' : 'off');
      } catch { if (!cancelled) setState('off'); }
    })();
    return () => { cancelled = true; };
  }, []);

  async function enable() {
    setBusy(true); setMessage('');
    try {
      const permission = await Notification.requestPermission();
      if (permission !== 'granted') { setState(permission === 'denied' ? 'blocked' : 'off'); setMessage('Sem a sua permissão não dá para avisar. Você pode liberar nas configurações do navegador.'); return; }
      const keyResponse = await authenticatedFetch('/api/v1/push/chave');
      if (!keyResponse.ok) throw new Error('Não foi possível preparar os avisos agora.');
      const { chave } = await keyResponse.json() as { chave: string };
      const registration = await navigator.serviceWorker.ready;
      const subscription = (await registration.pushManager.getSubscription()) ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(chave) });
      const json = subscription.toJSON();
      const save = await authenticatedFetch('/api/v1/push/inscrever', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }) });
      if (!save.ok) throw new Error('Não foi possível ligar os avisos. Tente de novo.');
      setState('on'); setMessage('Pronto! Você vai receber os avisos do BL neste aparelho.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não deu certo. Tente de novo.'); }
    finally { setBusy(false); }
  }

  async function disable() {
    setBusy(true); setMessage('');
    try {
      const registration = await navigator.serviceWorker.ready;
      const subscription = await registration.pushManager.getSubscription();
      if (subscription) {
        await authenticatedFetch('/api/v1/push/cancelar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => undefined);
        await subscription.unsubscribe();
      }
      setState('off'); setMessage('Avisos desligados neste aparelho.');
    } catch { setMessage('Não deu certo. Tente de novo.'); }
    finally { setBusy(false); }
  }

  if (state === 'checking') return null;
  return <article className="dashboard-card wide push-card" aria-labelledby="push-titulo">
    <div className="card-heading"><h2 id="push-titulo">Avisos no celular</h2></div>
    {state === 'unsupported' && <p className="muted">Este navegador não recebe avisos fora do site. No iPhone, instale o aplicativo na tela de início para ativar. Os avisos continuam aparecendo aqui na sua conta e por e-mail.</p>}
    {state === 'blocked' && <p className="muted">Os avisos estão bloqueados neste navegador. Libere nas configurações do navegador (cadeado ao lado do endereço) e volte aqui.</p>}
    {state === 'off' && <><p className="muted">Receba pagamento confirmado, comprovante do jogo e novidades dos bolões direto no celular, mesmo com o site fechado.</p><button type="button" className="button button-primary" disabled={busy} onClick={() => void enable()}>{busy ? 'Ligando…' : 'Ligar avisos neste aparelho'}</button></>}
    {state === 'on' && <><p>Os avisos estão <strong>ligados</strong> neste aparelho.</p><button type="button" className="button button-secondary" disabled={busy} onClick={() => void disable()}>Desligar neste aparelho</button></>}
    {message && <p role="status" className="muted">{message}</p>}
  </article>;
}
