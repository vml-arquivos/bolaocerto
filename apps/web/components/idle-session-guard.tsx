'use client';

import { useEffect } from 'react';
import { heartbeatMs, IDLE_STORAGE, isIdle, isProtectedPath, loginPathFor } from '../lib/idle-session';

/**
 * Segurança: quem esquece a tela aberta é desconectado depois de um tempo sem usar (30 min na equipe, 60 min para
 * afiliado e cliente). Enquanto a pessoa está mexendo, a sessão é renovada sozinha; parada, o prazo do servidor vence
 * e o site também encerra a sessão e pede o login de novo.
 */
export function IdleSessionGuard() {
  useEffect(() => {
    let hint = false;
    try { hint = localStorage.getItem(IDLE_STORAGE.hint) === '1'; } catch { /* navegação privada */ }
    if (!hint) return;
    let off = false;
    let limitMin = 0;
    let papel = '';
    let timer: number | undefined;
    const store = {
      get: (key: string) => { try { return Number(localStorage.getItem(key) || 0); } catch { return 0; } },
      set: (key: string, value: number) => { try { localStorage.setItem(key, String(value)); } catch { /* ok */ } },
      clear: () => { try { Object.values(IDLE_STORAGE).forEach((key) => localStorage.removeItem(key)); } catch { /* ok */ } },
    };

    async function leave() {
      if (off) return;
      off = true;
      window.clearInterval(timer);
      await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
      store.clear();
      if (papel !== 'cotista' || isProtectedPath(window.location.pathname)) window.location.href = `${loginPathFor(papel)}?motivo=inatividade`;
      else window.location.reload();
    }

    async function renew(): Promise<boolean> {
      const response = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' }).catch(() => null);
      if (response?.ok) { store.set(IDLE_STORAGE.refresh, Date.now()); return true; }
      return response === null; // sem rede não derruba a sessão; resposta de erro, sim
    }

    let lastWrite = 0;
    function onActivity() {
      if (off) return;
      const now = Date.now();
      if (isIdle(store.get(IDLE_STORAGE.activity), now, limitMin)) { void leave(); return; }
      if (now - lastWrite > 2000) { lastWrite = now; store.set(IDLE_STORAGE.activity, now); }
      if (now - store.get(IDLE_STORAGE.refresh) > heartbeatMs(limitMin)) {
        store.set(IDLE_STORAGE.refresh, now);
        void renew().then((ok) => { if (!ok) void leave(); });
      }
    }

    async function start() {
      const now = Date.now();
      let me = await fetch('/api/v1/auth/me', { credentials: 'include', cache: 'no-store' }).catch(() => null);
      if (me?.status === 401) {
        // Sem sessão válida e parado há mais do que o maior prazo (janela reaberta depois de muito tempo): limpa e para.
        if (isIdle(store.get(IDLE_STORAGE.activity), now, 60)) { store.clear(); return; }
        if (await renew()) me = await fetch('/api/v1/auth/me', { credentials: 'include', cache: 'no-store' }).catch(() => null);
      }
      if (off) return;
      if (!me?.ok) { if (me?.status === 401) store.clear(); return; }
      const user = await me.json().catch(() => ({})) as { papel?: string; sessaoOciosaMin?: number };
      papel = user.papel ?? 'cotista';
      limitMin = Number(user.sessaoOciosaMin) > 0 ? Number(user.sessaoOciosaMin) : papel === 'admin' || papel === 'operacao' ? 30 : 60;
      if (isIdle(store.get(IDLE_STORAGE.activity), Date.now(), limitMin)) { await leave(); return; }
      store.set(IDLE_STORAGE.activity, Date.now());
      for (const event of ['pointerdown', 'keydown', 'touchstart', 'wheel', 'scroll'] as const) window.addEventListener(event, onActivity, { passive: true, capture: true });
      window.addEventListener('mousemove', onActivity, { passive: true });
      document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') onActivity(); });
      timer = window.setInterval(() => { if (isIdle(store.get(IDLE_STORAGE.activity), Date.now(), limitMin)) void leave(); }, 15_000);
    }

    // Outra aba saiu da conta: esta também.
    const onStorage = (event: StorageEvent) => { if (event.key === IDLE_STORAGE.hint && event.newValue === null && !off) { off = true; window.clearInterval(timer); window.location.href = `${loginPathFor(papel)}?motivo=inatividade`; } };
    window.addEventListener('storage', onStorage);
    void start().catch(() => undefined);
    return () => { off = true; window.clearInterval(timer); window.removeEventListener('storage', onStorage); };
  }, []);
  return null;
}
