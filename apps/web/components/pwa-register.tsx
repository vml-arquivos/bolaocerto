'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
export function InstallAppButton() { return <button type="button" className="button button-primary" onClick={() => window.dispatchEvent(new Event('bl:install'))}>Instalar aplicativo</button>; }
export function PwaRegister() {
  const pathname = usePathname();
  const staff = /^\/(admin|afiliado|operacao)(\/|$)/.test(pathname);
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [instructions, setInstructions] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [offline, setOffline] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const acceptedUpdate = useRef(false);
  useEffect(() => {
    const media = matchMedia('(display-mode: standalone)');
    const detectInstalled = () => setInstalled(media.matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone));
    detectInstalled(); media.addEventListener('change', detectInstalled);
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    try { setHidden(Number(localStorage.getItem('bl-install-dismissed-until') ?? 0) > Date.now()); } catch { setHidden(false); }
    const capture = (event: Event) => { event.preventDefault(); setPrompt(event as InstallEvent); };
    const onInstalled = () => { setInstalled(true); setPrompt(null); setInstructions(false); };
    const open = () => { setInstructions(true); setHidden(false); };
    const network = () => setOffline(!navigator.onLine); network();
    window.addEventListener('beforeinstallprompt', capture); window.addEventListener('appinstalled', onInstalled);
    window.addEventListener('bl:install', open); window.addEventListener('online', network); window.addEventListener('offline', network);
    let disposed = false;
    let registration: ServiceWorkerRegistration | undefined;
    let installingWorker: ServiceWorker | null = null;
    const stateChange = () => { if (!disposed && installingWorker?.state === 'installed' && navigator.serviceWorker.controller) setWaiting(registration?.waiting ?? null); };
    const updateFound = () => { installingWorker = registration?.installing ?? null; installingWorker?.addEventListener('statechange', stateChange); };
    const controllerChange = () => { if (acceptedUpdate.current) window.location.reload(); };
    const checkUpdate = () => { if (document.visibilityState === 'visible') void registration?.update().catch(() => undefined); };
    if ('serviceWorker' in navigator && window.isSecureContext) {
      navigator.serviceWorker.addEventListener('controllerchange', controllerChange);
      void navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' }).then(reg => {
        if (disposed) return;
        registration = reg; setWaiting(reg.waiting);
        reg.addEventListener('updatefound', updateFound); updateFound();
      }).catch(() => { if (!disposed) setMessage('Não foi possível preparar o aplicativo. Você pode continuar usando o site.'); });
      document.addEventListener('visibilitychange', checkUpdate);
    }
    return () => {
      disposed = true; media.removeEventListener('change', detectInstalled);
      window.removeEventListener('beforeinstallprompt', capture); window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('bl:install', open); window.removeEventListener('online', network); window.removeEventListener('offline', network);
      registration?.removeEventListener('updatefound', updateFound); installingWorker?.removeEventListener('statechange', stateChange);
      navigator.serviceWorker?.removeEventListener('controllerchange', controllerChange); document.removeEventListener('visibilitychange', checkUpdate);
    };
  }, []);
  function dismiss() { setHidden(true); setInstructions(false); try { localStorage.setItem('bl-install-dismissed-until', String(Date.now() + 7 * 86400000)); } catch { /* private browsing */ } }
  async function install() {
    if (!prompt) { setInstructions(true); return; }
    setBusy(true);
    try { await prompt.prompt(); const choice = await prompt.userChoice; if (choice.outcome === 'accepted') { setHidden(true); setInstructions(false); } }
    catch { setInstructions(true); setMessage('Use o menu do navegador para adicionar à tela de início.'); }
    finally { setPrompt(null); setBusy(false); }
  }
  return <>
    {offline && <div className="app-network-status" role="status">Sem conexão. Compras, pagamentos e saldos precisam de conexão. Consulte sua conta ao reconectar antes de repetir uma operação.</div>}
    {!staff && waiting && <div className="pwa-update" role="status"><span>Nova versão disponível. Conclua compras e edições antes de atualizar.</span><button className="button button-secondary" onClick={() => { if (window.confirm('Atualizar e recarregar o aplicativo agora? Conclua operações em andamento antes de continuar.')) { acceptedUpdate.current = true; waiting.postMessage({ type: 'ACTIVATE_UPDATE' }); } }}>Atualizar aplicativo</button></div>}
    {!staff && !installed && !hidden && (prompt || ios || instructions) && <section className="install-banner" aria-label="Instalar Bolão Livre"><strong>Bolão Livre no seu celular</strong>{instructions || ios ? <p>{ios ? 'No iPhone/iPad: abra no Safari, toque em Compartilhar → Adicionar à Tela de Início. Se aparecer “Abrir como App”, mantenha ativado.' : 'No menu do navegador, procure “Instalar aplicativo” ou “Adicionar à tela inicial”. Se não aparecer, abra este site no Chrome ou Edge atualizado.'}</p> : <span>Instale para acessar bolões, cotas e resultados pela tela inicial.</span>}{prompt && <button className="button button-primary" disabled={busy} onClick={() => void install()}>{busy ? 'Aguarde…' : 'Instalar'}</button>}<button className="button button-ghost" onClick={dismiss}>Agora não</button>{message && <p role="status">{message}</p>}</section>}
    {!staff && installed && instructions && <div className="install-banner"><p>Você já está usando o aplicativo instalado.</p><button className="button" onClick={() => setInstructions(false)}>Fechar</button></div>}
  </>;
}
