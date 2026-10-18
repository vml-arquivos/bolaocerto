'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';

type Status = { condicional: boolean; liberado: boolean; inscrito: boolean; total: number };

/** "Avise-me quando liberar": aparece só em bolão condicional que ainda está bloqueado. */
export function NotifyMe({ poolId }: { poolId: string }) {
  const [status, setStatus] = useState<Status | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [needsLogin, setNeedsLogin] = useState(false);

  useEffect(() => {
    void fetch(`/api/v1/boloes/${poolId}/avise-me`, { credentials: 'include' }).then((r) => (r.ok ? r.json() : null)).then((data: Status | null) => setStatus(data)).catch(() => undefined);
  }, [poolId]);

  async function toggle() {
    if (!status) return;
    setBusy(true); setMessage(''); setNeedsLogin(false);
    try {
      const response = await fetch(`/api/v1/boloes/${poolId}/avise-me`, { method: status.inscrito ? 'DELETE' : 'POST', credentials: 'include' });
      if (response.status === 401) { setNeedsLogin(true); return; }
      const data = await response.json().catch(() => ({})) as { inscrito?: boolean; mensagem?: string; message?: string };
      if (!response.ok) throw new Error(data.message || 'Não foi possível salvar agora.');
      const inscrito = Boolean(data.inscrito);
      setStatus({ ...status, inscrito, total: Math.max(0, status.total + (inscrito ? 1 : -1)) });
      setMessage(inscrito ? (data.mensagem ?? 'Combinado! Vamos avisar você.') : 'Aviso cancelado.');
    } catch (issue) { setMessage(issue instanceof Error ? issue.message : 'Erro inesperado.'); } finally { setBusy(false); }
  }

  if (!status || !status.condicional || status.liberado) return null;
  return <div className="notify-me">
    <button type="button" className={`button ${status.inscrito ? 'button-ghost' : 'button-primary'}`} onClick={() => void toggle()} disabled={busy} aria-pressed={status.inscrito}>{status.inscrito ? '✓ Você será avisado · cancelar' : 'Avise-me quando liberar'}</button>
    {status.total > 0 && <small className="muted">{status.total} {status.total === 1 ? 'pessoa pediu' : 'pessoas pediram'} aviso</small>}
    {needsLogin && <small className="form-error">Entre na sua conta para pedir o aviso. <Link href="/login"><u>Entrar</u></Link></small>}
    {message && <small className="muted" role="status">{message}</small>}
  </div>;
}
