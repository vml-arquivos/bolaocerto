'use client';

import { useEffect } from 'react';

export type FunnelEventName = 'visita_home' | 'bolao_visto' | 'cadastro_iniciado';

/**
 * Conta uma etapa do funil (só um número somado no servidor, sem dado da pessoa).
 * Uma vez por etapa e por sessão do navegador; não faz nada se a pessoa pediu "não rastrear".
 */
export function FunnelBeacon({ name }: { name: FunnelEventName }) {
  useEffect(() => {
    try {
      if (navigator.doNotTrack === '1') return;
      const key = `bl-funil-${name}`;
      if (window.sessionStorage.getItem(key)) return;
      window.sessionStorage.setItem(key, '1');
    } catch { /* sem sessionStorage: conta mesmo assim, uma vez por abertura da página */ }
    void fetch('/api/v1/funil/evento', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nome: name }), keepalive: true }).catch(() => undefined);
  }, [name]);
  return null;
}
