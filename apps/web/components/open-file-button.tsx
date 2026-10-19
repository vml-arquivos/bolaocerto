'use client';

import { useState } from 'react';
import { openProtectedFile } from '../lib/files';

/** Botão "Abrir" para arquivos protegidos. Mostra o motivo se a pessoa não puder abrir. */
export function OpenFileButton({ id, label = 'Abrir', className = 'text-link' }: { id: string; label?: string; className?: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  return <span className="open-file">
    <button type="button" className={className} disabled={busy} onClick={async () => { setBusy(true); setError(''); try { setError((await openProtectedFile(id)) ?? ''); } catch { setError('Não foi possível abrir o arquivo.'); } finally { setBusy(false); } }}>{busy ? 'Abrindo…' : label}</button>
    {error && <small className="open-file-error" role="alert">{error}</small>}
  </span>;
}
