import { authenticatedFetch } from './client-api';

export type PushState = 'checking' | 'unsupported' | 'needs-install' | 'blocked' | 'off' | 'on';

function toKey(base64: string) {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=').replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

/** Situação dos avisos neste aparelho. No iPhone só funciona com o app instalado na tela de início. */
export async function readPushState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return 'needs-install';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window) || !window.isSecureContext) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  try {
    const registration = await navigator.serviceWorker.ready;
    const existing = await registration.pushManager.getSubscription();
    return existing && Notification.permission === 'granted' ? 'on' : 'off';
  } catch { return 'off'; }
}

/** Pede permissão, cria a inscrição e guarda no servidor. Devolve o novo estado ou lança uma mensagem simples. */
export async function enablePush(): Promise<PushState> {
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
  const keyResponse = await authenticatedFetch('/api/v1/push/chave');
  if (!keyResponse.ok) throw new Error('Não foi possível preparar os avisos agora.');
  const { chave } = await keyResponse.json() as { chave: string };
  const registration = await navigator.serviceWorker.ready;
  const subscription = (await registration.pushManager.getSubscription()) ?? await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: toKey(chave) });
  const json = subscription.toJSON();
  const save = await authenticatedFetch('/api/v1/push/inscrever', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }) });
  if (!save.ok) throw new Error('Não foi possível ligar os avisos. Tente de novo.');
  return 'on';
}

export async function disablePush(): Promise<void> {
  const registration = await navigator.serviceWorker.ready;
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await authenticatedFetch('/api/v1/push/cancelar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => undefined);
    await subscription.unsubscribe();
  }
}
