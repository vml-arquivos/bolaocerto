'use client';

import { useEffect, useState } from 'react';
import { modalityNames } from '../lib/domain';

type Row = { modalidade: string; aberto: boolean; ultimo: { numero: number; status: string; previsto?: boolean; dataSorteio: string; cutoffAt: string; sincronizadoEm?: string | null } | null };

const when = (value: string) => new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });

/** Uma linha por modalidade: tem concurso aberto ou, se não tem, por quê. Responde "cadê o concurso?" sem precisar adivinhar. */
export function ContestStatusStrip({ refreshKey }: { refreshKey?: unknown }) {
  const [rows, setRows] = useState<Row[] | null>(null);
  useEffect(() => {
    let off = false;
    void fetch('/api/v1/admin/concursos/situacao', { credentials: 'include', cache: 'no-store' }).then(async (response) => (response.ok ? await response.json() : null)).then((data) => { if (!off && Array.isArray(data)) setRows(data as Row[]); }).catch(() => undefined);
    return () => { off = true; };
  }, [refreshKey]);
  if (!rows) return null;
  return <div className="contest-status-strip" aria-label="Situação de cada modalidade">
    {rows.map((row) => <div key={row.modalidade} className={row.aberto ? 'is-open' : 'is-closed'}>
      <strong>{modalityNames[row.modalidade] ?? row.modalidade}</strong>
      {row.aberto && row.ultimo ? <span>Aberto · #{row.ultimo.numero}{row.ultimo.previsto ? ' (data prevista)' : ''} · fecha {when(row.ultimo.cutoffAt)}</span>
        : row.ultimo ? <span>Sem concurso aberto · último #{row.ultimo.numero} (sorteio {when(row.ultimo.dataSorteio)}). Clique em “Atualizar agora”.</span>
        : <span>Nenhum concurso ainda · clique em “Atualizar agora”.</span>}
    </div>)}
  </div>;
}
