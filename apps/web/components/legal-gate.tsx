'use client';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';

const HINT = 'bl-session-hint';

/**
 * Quem já tinha conta (ou quando o texto dos termos muda) precisa aceitar os Termos de Uso, a Política de Privacidade
 * (LGPD) e declarar que tem 18 anos ou mais. A janela aparece só para clientes e afiliados com aceite pendente.
 */
export function LegalGate() {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  useEffect(() => {
    let hint = false;
    try { hint = localStorage.getItem(HINT) === '1'; } catch { /* navegação privada */ }
    if (!hint) return;
    let off = false;
    (async () => {
      const me = await fetch('/api/v1/auth/me', { credentials: 'include', cache: 'no-store' });
      if (!me.ok) return;
      const user = await me.json() as { papel?: string };
      if (user.papel === 'admin' || user.papel === 'operacao') return;
      const pending = await fetch('/api/v1/conta/aceites-pendentes', { credentials: 'include', cache: 'no-store' });
      if (!pending.ok) return;
      const data = await pending.json() as { pendentes?: unknown[] };
      if (!off && (data.pendentes?.length ?? 0) > 0) setOpen(true);
    })().catch(() => undefined);
    return () => { off = true; };
  }, []);
  useEffect(() => {
    if (!open) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = previous; };
  }, [open]);
  if (!open) return null;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    if (form.get('termos') !== 'on' || form.get('privacidade') !== 'on' || form.get('maiorDeIdade') !== 'on') { setMessage('Marque as três opções para continuar.'); return; }
    setBusy(true); setMessage('');
    try {
      const response = await fetch('/api/v1/conta/aceites', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ termos: true, privacidade: true, maiorDeIdade: true }) });
      if (!response.ok) { const result = await response.json().catch(() => ({})) as { message?: string | string[] }; throw new Error(Array.isArray(result.message) ? result.message.join(' ') : result.message || 'Não foi possível registrar o aceite.'); }
      setOpen(false);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Não foi possível registrar o aceite.'); } finally { setBusy(false); }
  }
  return <div className="legal-gate" role="dialog" aria-modal="true" aria-labelledby="legal-gate-title">
    <form className="legal-gate-card" onSubmit={submit}>
      <h2 id="legal-gate-title">Antes de continuar</h2>
      <p>Para usar o Bolão Livre, precisamos do seu aceite nos documentos abaixo.</p>
      <label className="field-check"><input type="checkbox" name="termos" /> <span>Li e aceito os <Link href="/termos" target="_blank" rel="noopener">Termos de Uso</Link>.</span></label>
      <label className="field-check"><input type="checkbox" name="privacidade" /> <span>Li e aceito a <Link href="/privacidade" target="_blank" rel="noopener">Política de Privacidade (LGPD)</Link>.</span></label>
      <label className="field-check"><input type="checkbox" name="maiorDeIdade" /> <span>Declaro que tenho 18 anos ou mais.</span></label>
      {message && <div className="form-message form-error" role="alert">{message}</div>}
      <button className="button button-primary" disabled={busy}>{busy ? 'Salvando…' : 'Aceitar e continuar'}</button>
    </form>
  </div>;
}
