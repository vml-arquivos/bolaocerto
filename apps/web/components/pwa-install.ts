'use client';
// Guarda o evento de instalação do navegador em um único lugar, para que o botão
// da página /instalar e o aviso do rodapé usem o mesmo prompt.
export type InstallEvent = Event & { prompt: () => Promise<void>; userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }> };
type Listener = () => void;
let deferred: InstallEvent | null = null;
let started = false;
const listeners = new Set<Listener>();
const emit = () => listeners.forEach(fn => fn());

export function startInstallCapture() {
  if (started || typeof window === 'undefined') return;
  started = true;
  window.addEventListener('beforeinstallprompt', event => { event.preventDefault(); deferred = event as InstallEvent; emit(); });
  window.addEventListener('appinstalled', () => { deferred = null; emit(); });
}
export function getInstallPrompt() { return deferred; }
export function clearInstallPrompt() { deferred = null; emit(); }
export function subscribeInstall(fn: Listener) { listeners.add(fn); return () => { listeners.delete(fn); }; }
export function isAndroid() { return typeof navigator !== 'undefined' && /Android/i.test(navigator.userAgent); }
export function isStandalone() {
  if (typeof window === 'undefined') return false;
  return matchMedia('(display-mode: standalone)').matches || Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
}
