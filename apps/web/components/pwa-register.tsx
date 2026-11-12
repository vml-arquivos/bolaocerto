'use client';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { clearInstallPrompt, getInstallPrompt, isAndroid, isStandalone, startInstallCapture, subscribeInstall, type InstallEvent } from './pwa-install';
startInstallCapture();

function useInstallState() {
  const [prompt, setPrompt] = useState<InstallEvent | null>(null);
  const [installed, setInstalled] = useState(false);
  useEffect(() => {
    const sync = () => { setPrompt(getInstallPrompt()); setInstalled(isStandalone()); };
    sync();
    const media = matchMedia('(display-mode: standalone)');
    media.addEventListener('change', sync);
    const off = subscribeInstall(sync);
    return () => { media.removeEventListener('change', sync); off(); };
  }, []);
  return { prompt, installed };
}

// Botão da página /instalar: abre o instalador do navegador quando ele estiver disponível;
// senão mostra, logo abaixo do botão, o passo a passo do aparelho.
export function InstallAppButton({ label = 'Instalar aplicativo', hideWhenInstalled = false, className = 'button button-primary' }: { label?: string; hideWhenInstalled?: boolean; className?: string }) {
  const { prompt, installed } = useInstallState();
  const [hint, setHint] = useState('');
  const [busy, setBusy] = useState(false);
  async function click() {
    setHint('');
    const event = getInstallPrompt();
    if (!event) {
      const ios = /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
      setHint(ios
        ? 'No iPhone/iPad: abra no Safari, toque em Compartilhar e escolha “Adicionar à Tela de Início”.'
        : isAndroid()
          ? 'No Android: abra o menu ⋮ do Chrome e toque em “Instalar aplicativo” (ou “Adicionar à tela inicial”). Se a opção não aparecer, atualize o Chrome e abra este site direto no Chrome, fora do navegador do WhatsApp ou Instagram.'
          : 'Abra o menu do navegador e procure “Instalar aplicativo”. No Chrome ou Edge atualizado, o ícone de instalar também aparece na barra de endereço.');
      return;
    }
    setBusy(true);
    try { await event.prompt(); const choice = await event.userChoice; if (choice.outcome === 'dismissed') setHint('Instalação cancelada. Você pode tentar de novo quando quiser.'); }
    catch { setHint('Use o menu do navegador e toque em “Instalar aplicativo”.'); }
    finally { clearInstallPrompt(); setBusy(false); }
  }
  if (installed) return hideWhenInstalled ? null : <p className="install-state" role="status">✓ Você já está usando o aplicativo instalado.</p>;
  return <div className="install-action"><button type="button" className={className} disabled={busy} onClick={() => void click()}>{busy ? 'Aguarde…' : label}</button>{!prompt && !hint && <small className="muted">Se nada abrir, toque no botão para ver o passo a passo do seu aparelho.</small>}{hint && <p className="install-hint" role="status">{hint}</p>}</div>;
}
export function PwaRegister() {
  const pathname = usePathname();
  const staff = /^\/(admin|afiliado|operacao)(\/|$)/.test(pathname);
  // Painel e área do afiliado são aplicativos próprios: também recebem o aviso de nova versão.
  const adminApp = /^\/(admin|afiliado)(\/|$)/.test(pathname);
  const { prompt, installed } = useInstallState();
  const onInstallPage = pathname === '/instalar';
  // Três aplicativos: cliente (site), painel da equipe (/admin) e área do afiliado (/afiliado). Cada um oferece a própria instalação.
  const app: 'cliente' | 'admin' | 'afiliado' | null = /^\/admin(\/|$)/.test(pathname) ? 'admin' : /^\/afiliado(\/|$)/.test(pathname) ? 'afiliado' : staff ? null : 'cliente';
  const dismissKey = app === 'cliente' ? 'bl-install-dismissed-until' : `bl-install-dismissed-until-${app}`;
  const banner = app === 'admin'
    ? { title: 'Painel BL Admin no seu celular', text: 'Instale o painel para operar bolões, pagamentos, notas e relatórios direto da tela inicial, como um aplicativo.' }
    : app === 'afiliado'
      ? { title: 'Área do afiliado no seu celular', text: 'Instale para acompanhar vendas, comissões e seus links direto da tela inicial.' }
      : { title: 'Bolão Livre no seu celular', text: 'Instale para acessar bolões, cotas e resultados pela tela inicial.' };
  const [ios, setIos] = useState(false);
  const [hidden, setHidden] = useState(true);
  const [instructions, setInstructions] = useState(false);
  const [waiting, setWaiting] = useState<ServiceWorker | null>(null);
  const [offline, setOffline] = useState(false);
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  const acceptedUpdate = useRef(false);
  useEffect(() => {
    setIos(/iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1));
    try { setHidden(Number(localStorage.getItem(dismissKey) ?? 0) > Date.now()); } catch { setHidden(false); }
    const onInstalled = () => { setInstructions(false); };
    const open = () => { setInstructions(true); setHidden(false); };
    const network = () => setOffline(!navigator.onLine); network();
    window.addEventListener('appinstalled', onInstalled);
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
      disposed = true;
      window.removeEventListener('appinstalled', onInstalled);
      window.removeEventListener('bl:install', open); window.removeEventListener('online', network); window.removeEventListener('offline', network);
      registration?.removeEventListener('updatefound', updateFound); installingWorker?.removeEventListener('statechange', stateChange);
      navigator.serviceWorker?.removeEventListener('controllerchange', controllerChange); document.removeEventListener('visibilitychange', checkUpdate);
    };
  }, [dismissKey]);
  function dismiss() { setHidden(true); setInstructions(false); try { localStorage.setItem(dismissKey, String(Date.now() + 7 * 86400000)); } catch { /* private browsing */ } }
  async function install() {
    if (!prompt) { setInstructions(true); return; }
    setBusy(true);
    try { await prompt.prompt(); const choice = await prompt.userChoice; if (choice.outcome === 'accepted') { setHidden(true); setInstructions(false); } }
    catch { setInstructions(true); setMessage('Use o menu do navegador para adicionar à tela de início.'); }
    finally { clearInstallPrompt(); setBusy(false); }
  }
  return <>
    {offline && <div className="app-network-status" role="status">Sem conexão. Compras, pagamentos e saldos precisam de conexão. Consulte sua conta ao reconectar antes de repetir uma operação.</div>}
    {(!staff || adminApp) && waiting && <div className="pwa-update" role="status"><span>Nova versão disponível. Conclua compras e edições antes de atualizar.</span><button className="button button-secondary" onClick={() => { if (window.confirm('Atualizar e recarregar o aplicativo agora? Conclua operações em andamento antes de continuar.')) { acceptedUpdate.current = true; waiting.postMessage({ type: 'ACTIVATE_UPDATE' }); } }}>Atualizar aplicativo</button></div>}
    {app && !onInstallPage && !installed && !hidden && (prompt || ios || instructions) && <section className={`install-banner install-banner-${app}`} aria-label={`Instalar ${banner.title}`}><strong>{banner.title}</strong>{instructions || ios ? <p>{ios ? 'No iPhone/iPad: abra no Safari, toque em Compartilhar → Adicionar à Tela de Início. Se aparecer “Abrir como App”, mantenha ativado.' : 'No menu do navegador, procure “Instalar aplicativo” ou “Adicionar à tela inicial”. Se não aparecer, abra este site no Chrome ou Edge atualizado.'}</p> : <span>{banner.text}</span>}{prompt && <button className="button button-primary" disabled={busy} onClick={() => void install()}>{busy ? 'Aguarde…' : 'Instalar'}</button>}<button className="button button-ghost" onClick={dismiss}>Agora não</button>{message && <p role="status">{message}</p>}</section>}
    {app && !onInstallPage && installed && instructions && <div className="install-banner"><p>Você já está usando o aplicativo instalado.</p><button className="button" onClick={() => setInstructions(false)}>Fechar</button></div>}
  </>;
}
