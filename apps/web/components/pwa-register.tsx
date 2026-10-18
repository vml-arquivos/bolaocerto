'use client';

import { useEffect, useState } from 'react';

type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: string }> };

/** Registra o service worker e oferece "Instalar app" quando o navegador permite. */
export function PwaRegister() {
  const [installEvent, setInstallEvent] = useState<InstallEvent | null>(null);
  const [hidden, setHidden] = useState(false);

  useEffect(() => {
    if ('serviceWorker' in navigator && window.location.protocol === 'https:') {
      navigator.serviceWorker.register('/sw.js').catch(() => undefined);
    }
    try { if (localStorage.getItem('bl-install-dismissed') === '1') setHidden(true); } catch { /* ignora */ }
    const onPrompt = (e: Event) => { e.preventDefault(); setInstallEvent(e as InstallEvent); };
    window.addEventListener('beforeinstallprompt', onPrompt);
    return () => window.removeEventListener('beforeinstallprompt', onPrompt);
  }, []);

  if (!installEvent || hidden) return null;
  return (
    <div className="install-banner" role="dialog" aria-label="Instalar aplicativo">
      <span>Instale o Bolão Livre no seu celular para acessar mais rápido.</span>
      <button type="button" className="button primary" onClick={async () => { await installEvent.prompt(); setInstallEvent(null); }}>Instalar</button>
      <button type="button" className="button ghost" onClick={() => { setHidden(true); try { localStorage.setItem('bl-install-dismissed', '1'); } catch { /* ignora */ } }}>Agora não</button>
    </div>
  );
}
