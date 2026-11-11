'use client';

import { useCallback, useEffect, useState } from 'react';
import { api, brl, dateTime, Notify, Panel, Rec } from './admin-ui';
import { modalityNames } from '../lib/domain';
import { RefundChoice } from './admin-finance-tools';

/** Pedidos de cancelamento de cota paga feitos pelos clientes: aparece só quando há algum esperando resposta. */
export function CancellationRequests({ notify, onChanged }: { notify: Notify; onChanged?: () => void | Promise<void> }) {
  const [rows, setRows] = useState<Rec[]>([]);
  const [open, setOpen] = useState<{ id: string; kind: 'aprovar' | 'recusar' } | null>(null);
  const [refundTo, setRefundTo] = useState<'carteira' | 'pix'>('carteira');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { const data = await api('/api/v1/admin/pedidos-cancelamento?status=pendente'); setRows(data.items ?? []); } catch { setRows([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);

  async function submit(row: Rec) {
    if (!open) return;
    if (open.kind === 'recusar' && text.trim().length < 3) { notify('error', 'Escreva o motivo da recusa: o cliente recebe essa resposta.'); return; }
    setBusy(true);
    try {
      if (open.kind === 'aprovar') await api(`/api/v1/admin/pedidos-cancelamento/${row.id}/aprovar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ devolucao: refundTo, resposta: text.trim() || undefined }) });
      else await api(`/api/v1/admin/pedidos-cancelamento/${row.id}/recusar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ resposta: text.trim() }) });
      notify('success', open.kind === 'aprovar' ? (refundTo === 'carteira' ? 'Cancelamento aprovado e valor devolvido na carteira.' : 'Cancelamento aprovado. Lembre de devolver o Pix ao cliente pelo banco.') : 'Pedido recusado. O cliente foi avisado.');
      setOpen(null); setText(''); await load(); await onChanged?.();
    } catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível responder ao pedido.'); }
    finally { setBusy(false); }
  }

  if (!rows.length) return null;
  return <Panel title={`Pedidos de cancelamento (${rows.length})`} description="O cliente pediu para cancelar uma cota que já pagou. Responda dentro do prazo do Código de Defesa do Consumidor.">
    <div className="cancel-requests">
      {rows.map((row) => <article key={row.id} className="cancel-request">
        <header><div><strong>{row.cliente}</strong><small>{row.email}</small></div><strong>{brl(row.valor)}</strong></header>
        <p className="cancel-request-meta">{modalityNames[row.bolao.modalidade] ?? row.bolao.modalidade} · concurso {row.bolao.numeroConcurso} · {row.quantidade} {row.quantidade === 1 ? 'cota' : 'cotas'} · pago por {row.pagamento?.formaBaixa === 'saldo_bl' ? 'saldo do BL' : (row.pagamento?.metodo ?? '—')} · pedido em {dateTime(row.criadoEm)}</p>
        {row.motivo && <p className="cancel-request-reason">&ldquo;{row.motivo}&rdquo;</p>}
        {row.cotaStatus !== 'paga' && <p className="admin-note is-error">A cota está &ldquo;{row.cotaStatus}&rdquo;: só dá para aprovar enquanto ela está paga e a aposta não foi registrada.</p>}
        {open && open.id === row.id ? <div className="cancel-request-form">
          {open.kind === 'aprovar' && <RefundChoice value={row.pagamento?.formaBaixa === 'saldo_bl' ? 'carteira' : refundTo} onChange={setRefundTo} />}
          {open.kind === 'aprovar' && row.pagamento?.formaBaixa === 'saldo_bl' && <small className="muted">Foi paga com o saldo do BL: o valor volta para o saldo.</small>}
          <input aria-label="Mensagem ao cliente" placeholder={open.kind === 'recusar' ? 'Motivo da recusa (o cliente recebe)' : 'Mensagem ao cliente (opcional)'} value={text} maxLength={500} onChange={(event) => setText(event.target.value)} />
          <div className="admin-row-actions"><button className="admin-button admin-button-small admin-button-primary" disabled={busy} onClick={() => void submit(row)}>{busy ? 'Salvando…' : open.kind === 'aprovar' ? 'Confirmar aprovação' : 'Confirmar recusa'}</button><button className="admin-button admin-button-small admin-button-ghost" onClick={() => setOpen(null)}>Voltar</button></div>
        </div> : <div className="admin-row-actions"><button className="admin-button admin-button-small admin-button-primary" onClick={() => { setOpen({ id: row.id, kind: 'aprovar' }); setText(''); }}>Aprovar e devolver</button><button className="admin-button admin-button-small admin-button-ghost" onClick={() => { setOpen({ id: row.id, kind: 'recusar' }); setText(''); }}>Recusar</button></div>}
      </article>)}
    </div>
  </Panel>;
}
