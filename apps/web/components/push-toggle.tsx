'use client';
import { useEffect, useState } from 'react';
import { disablePush, enablePush, readPushState, resyncPush, sendTestPush, type PushState } from '../lib/push';

/** Liga ou desliga os avisos no celular/computador (PWA). Cada aparelho decide por si. */
export function PushToggle() {
  const [state, setState] = useState<PushState>('checking');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  useEffect(() => {
    let cancelled = false;
    readPushState().then((next) => { if (!cancelled) setState(next); if (next === 'on') void resyncPush(); });
    return () => { cancelled = true; };
  }, []);

  async function enable() {
    setBusy(true); setMessage('');
    try {
      const next = await enablePush();
      setState(next);
      setMessage(next === 'on' ? 'Pronto! Você vai receber os avisos do BL neste aparelho.' : 'Sem a sua permissão não dá para avisar. Você pode liberar nas configurações do navegador.');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não deu certo. Tente de novo.'); }
    finally { setBusy(false); }
  }

  async function test() {
    setBusy(true); setMessage('');
    const result = await sendTestPush();
    setMessage(result.texto);
    setBusy(false);
  }

  async function disable() {
    setBusy(true); setMessage('');
    try { await disablePush(); setState('off'); setMessage('Avisos desligados neste aparelho.'); }
    catch { setMessage('Não deu certo. Tente de novo.'); }
    finally { setBusy(false); }
  }

  if (state === 'checking') return null;
  return <article className="dashboard-card wide push-card" aria-labelledby="push-titulo">
    <div className="card-heading"><h2 id="push-titulo">Avisos no celular</h2></div>
    {state === 'in-app-browser' && <p className="muted">Você abriu o site dentro de outro aplicativo (WhatsApp, Instagram…), que não recebe avisos. Abra o endereço no Chrome (Android) ou no Safari (iPhone) e ligue os avisos por lá.</p>}
    {(state === 'unsupported' || state === 'needs-install') && <p className="muted">{state === 'needs-install' ? 'No iPhone, os avisos só funcionam com o aplicativo instalado: toque em Compartilhar → Adicionar à Tela de Início e abra o BL por esse ícone (iOS 16.4 ou mais novo).' : 'Este navegador não recebe avisos fora do site. Use o Chrome atualizado. Os avisos continuam aparecendo aqui na sua conta e por e-mail.'}</p>}
    {state === 'blocked' && <p className="muted">Os avisos estão bloqueados neste navegador. Libere nas configurações do navegador (cadeado ao lado do endereço) e volte aqui.</p>}
    {state === 'off' && <><p className="muted">Receba pagamento confirmado, comprovante do jogo e novidades dos bolões direto no celular, mesmo com o site fechado.</p><button type="button" className="button button-primary" disabled={busy} onClick={() => void enable()}>{busy ? 'Ligando…' : 'Ligar avisos neste aparelho'}</button></>}
    {state === 'on' && <><p>Os avisos estão <strong>ligados</strong> neste aparelho.</p><div className="push-actions"><button type="button" className="button button-primary" disabled={busy} onClick={() => void test()}>Enviar aviso de teste</button><button type="button" className="button button-secondary" disabled={busy} onClick={() => void disable()}>Desligar neste aparelho</button></div></>}
    {message && <p role="status" className="muted">{message}</p>}
  </article>;
}
