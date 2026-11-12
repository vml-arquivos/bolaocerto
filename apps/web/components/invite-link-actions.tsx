'use client';

import { useState } from 'react';

/** Copia texto mesmo onde a área de transferência moderna não está liberada (navegador antigo, página sem HTTPS). */
export async function copyText(text: string): Promise<boolean> {
  try { await navigator.clipboard.writeText(text); return true; } catch { /* tenta o jeito antigo */ }
  try {
    const area = document.createElement('textarea');
    area.value = text; area.setAttribute('readonly', ''); area.style.cssText = 'position:fixed;top:-1000px;opacity:0';
    document.body.appendChild(area); area.select(); area.setSelectionRange(0, text.length);
    const ok = document.execCommand('copy'); area.remove(); return ok;
  } catch { return false; }
}

/** Link de convite à vista, com Copiar, Compartilhar (celular) e WhatsApp. */
export function InviteLinkActions({ link, kind, compact = false }: { link: string; kind?: string; compact?: boolean }) {
  const [copied, setCopied] = useState<'' | 'ok' | 'fail'>('');
  const message = kind === 'afiliado'
    ? `Olá! Este é o seu convite para ser afiliado do Bolão Livre. Faça o seu cadastro pelo link: ${link}`
    : `Olá! Este é o seu convite para o Bolão Livre. Faça o seu cadastro pelo link: ${link}`;
  async function copy() { const ok = await copyText(link); setCopied(ok ? 'ok' : 'fail'); window.setTimeout(() => setCopied(''), 2500); }
  async function share() { try { await navigator.share({ title: 'Convite Bolão Livre', text: message, url: link }); } catch { /* cancelado */ } }
  const canShare = typeof navigator !== 'undefined' && typeof navigator.share === 'function';
  return <div className={`invite-link${compact ? ' is-compact' : ''}`}>
    {!compact && <input className="invite-link-url" readOnly value={link} onFocus={(event) => event.currentTarget.select()} aria-label="Link do convite" />}
    <div className="invite-link-buttons">
      <button type="button" className="admin-button admin-button-small admin-button-primary" onClick={() => void copy()}>{copied === 'ok' ? 'Copiado ✓' : copied === 'fail' ? 'Selecione e copie' : 'Copiar link'}</button>
      {canShare && <button type="button" className="admin-button admin-button-small" onClick={() => void share()}>Compartilhar</button>}
      <a className="admin-button admin-button-small" href={`https://wa.me/?text=${encodeURIComponent(message)}`} target="_blank" rel="noreferrer">WhatsApp</a>
    </div>
  </div>;
}
