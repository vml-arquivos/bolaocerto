import { authenticatedFetch } from './client-api';

export type PushState = 'checking' | 'unsupported' | 'in-app-browser' | 'needs-install' | 'blocked' | 'off' | 'on';

function toKey(base64: string) {
  const padded = base64.padEnd(base64.length + ((4 - (base64.length % 4)) % 4), '=').replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(padded);
  const bytes = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i += 1) bytes[i] = raw.charCodeAt(i);
  return bytes;
}

const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isStandalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
/** Navegador de dentro do WhatsApp, Instagram, Facebook, TikTok etc.: não recebe avisos. */
const isInAppBrowser = () => /FBAN|FBAV|Instagram|WhatsApp|Line\/|TikTok|musical_ly|Snapchat|Twitter|; wv\)/i.test(navigator.userAgent);

/** Espera uma promessa, mas não deixa o botão travado para sempre. */
function within<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(message)), ms);
    promise.then((value) => { clearTimeout(timer); resolve(value); }, (error) => { clearTimeout(timer); reject(error); });
  });
}

/** Garante o service worker do app pronto. Se ainda não foi registrado (primeiro acesso, cache), registra agora. */
async function readyWorker(): Promise<ServiceWorkerRegistration> {
  if (!(await navigator.serviceWorker.getRegistration())) await navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' });
  return within(navigator.serviceWorker.ready, 10_000, 'O aplicativo ainda está sendo preparado. Feche e abra de novo e tente outra vez.');
}

function sameKey(subscription: PushSubscription, key: Uint8Array): boolean {
  const current = subscription.options?.applicationServerKey;
  if (!current) return true;
  const a = new Uint8Array(current);
  return a.length === key.length && a.every((value, index) => value === key[index]);
}

/** Situação dos avisos neste aparelho. No iPhone só funciona com o app instalado na tela de início. */
export async function readPushState(): Promise<PushState> {
  if (isIos() && !isStandalone()) return 'needs-install';
  if (isInAppBrowser()) return 'in-app-browser';
  if (!('serviceWorker' in navigator) || !('PushManager' in window) || !('Notification' in window) || !window.isSecureContext) return 'unsupported';
  if (Notification.permission === 'denied') return 'blocked';
  try {
    const registration = await within(navigator.serviceWorker.ready, 4000, 'sem service worker');
    const existing = await registration.pushManager.getSubscription();
    return existing && Notification.permission === 'granted' ? 'on' : 'off';
  } catch { return 'off'; }
}

/** Mensagem simples para cada tipo de falha que os aparelhos devolvem. */
export function pushErrorMessage(error: unknown): string {
  const name = (error as { name?: string })?.name;
  const text = error instanceof Error ? error.message : '';
  if (name === 'NotAllowedError') return 'O aparelho não permitiu os avisos. Libere nas configurações do navegador e tente de novo.';
  if (name === 'AbortError') return 'O serviço de avisos do aparelho não respondeu. Confira a internet, atualize o Chrome e tente de novo. Em celulares sem os serviços do Google, os avisos não funcionam.';
  if (name === 'InvalidStateError') return 'O aplicativo precisa ser reaberto antes de ligar os avisos. Feche e abra de novo.';
  if (name === 'NotSupportedError' || name === 'SecurityError') return 'Este navegador não recebe avisos. Use o Chrome (Android) ou o app instalado na tela de início (iPhone).';
  return text || 'Não deu certo. Tente de novo.';
}

/** Pede permissão, cria a inscrição e guarda no servidor. Devolve o novo estado ou lança uma mensagem simples. */
export async function enablePush(): Promise<PushState> {
  try {
    const permission = await Notification.requestPermission();
    if (permission !== 'granted') return permission === 'denied' ? 'blocked' : 'off';
    const keyResponse = await authenticatedFetch('/api/v1/push/chave');
    if (!keyResponse.ok) throw new Error('Não foi possível preparar os avisos agora. Entre na sua conta de novo e tente outra vez.');
    const { chave } = await keyResponse.json() as { chave: string };
    const key = toKey(chave);
    const registration = await readyWorker();
    let subscription = await registration.pushManager.getSubscription();
    // Inscrição feita com outra chave (a chave do servidor mudou): o aparelho precisa se inscrever de novo.
    if (subscription && !sameKey(subscription, key)) { await subscription.unsubscribe().catch(() => undefined); subscription = null; }
    if (!subscription) subscription = await registration.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: key });
    const json = subscription.toJSON();
    const save = await authenticatedFetch('/api/v1/push/inscrever', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }) });
    if (!save.ok) throw new Error('Não foi possível ligar os avisos. Tente de novo.');
    return 'on';
  } catch (error) { throw new Error(pushErrorMessage(error)); }
}

/** Reenvia a inscrição do aparelho ao servidor (silencioso). Corrige o caso do servidor ter esquecido o aparelho. */
export async function resyncPush(): Promise<void> {
  try {
    if (Notification.permission !== 'granted') return;
    const registration = await within(navigator.serviceWorker.ready, 4000, 'sem service worker');
    const subscription = await registration.pushManager.getSubscription();
    if (!subscription) return;
    const json = subscription.toJSON();
    await authenticatedFetch('/api/v1/push/inscrever', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }) });
  } catch { /* melhor esforço */ }
}

/** Manda um aviso de teste para os aparelhos da pessoa e conta o que aconteceu. */
export async function sendTestPush(): Promise<{ ok: boolean; texto: string }> {
  try {
    const response = await authenticatedFetch('/api/v1/push/teste', { method: 'POST' });
    if (!response.ok) return { ok: false, texto: 'Não foi possível enviar o teste agora.' };
    const result = await response.json() as { enviados: number; aparelhos: number; motivo: string | null };
    if (result.enviados > 0) return { ok: true, texto: `Aviso enviado para ${result.enviados} aparelho(s). Ele deve aparecer em instantes.` };
    return { ok: false, texto: result.motivo ?? 'O aviso não foi entregue.' };
  } catch { return { ok: false, texto: 'Não foi possível enviar o teste agora.' }; }
}

export async function disablePush(): Promise<void> {
  const registration = await readyWorker();
  const subscription = await registration.pushManager.getSubscription();
  if (subscription) {
    await authenticatedFetch('/api/v1/push/cancelar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ endpoint: subscription.endpoint }) }).catch(() => undefined);
    await subscription.unsubscribe();
  }
}
