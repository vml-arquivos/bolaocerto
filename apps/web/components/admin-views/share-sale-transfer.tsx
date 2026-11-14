'use client';
import { useEffect, useState } from 'react';
import { fetchAdmin, money } from './shared';

type Affiliate = { id: string; nome: string; codigo: string; pct: string };
let cache: Affiliate[] | null = null;

/** Afiliado que fez a venda, com a comissão, e o botão para transferir a venda para outro afiliado (ou venda direta). */
export function ShareSaleCell({ item, onDone, notify }: { item: Record<string, any>; onDone: () => Promise<void> | void; notify: (kind: 'success' | 'error', text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [affiliates, setAffiliates] = useState<Affiliate[]>(cache ?? []);
  const [target, setTarget] = useState('');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const canTransfer = ['paga', 'registrada', 'apurada', 'premiada', 'reservada'].includes(item.status) && item.comissao?.status !== 'paga' && !item.comissao?.emLote;
  useEffect(() => {
    if (!open || cache) return;
    fetchAdmin('/api/v1/admin/afiliados?pageSize=100&status=aprovado').then((result: any) => {
      cache = (result.items ?? []).map((row: any) => ({ id: row.id, nome: row.usuario?.nome ?? row.codigoAfiliado, codigo: row.codigoAfiliado, pct: String(row.comissaoPadraoPct ?? '0') }));
      setAffiliates(cache!);
    }).catch(() => undefined);
  }, [open]);
  const current = item.afiliadoReferencia;
  async function save() {
    const chosen = affiliates.find((row) => row.id === target);
    const label = target === 'direta' ? 'venda direta (sem afiliado)' : chosen ? `${chosen.nome} (${chosen.codigo})` : '';
    if (!label) return;
    if (!window.confirm(`Passar a venda desta cota de ${item.titularNome} para ${label}? A comissão vai junto, recalculada com o percentual do novo afiliado.`)) return;
    setBusy(true);
    try {
      const result = await fetchAdmin(`/api/v1/admin/cotas/${item.id}/afiliado`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ afiliadoId: target === 'direta' ? null : target, ...(reason.trim() ? { motivo: reason.trim() } : {}) }) });
      notify('success', result.afiliado ? `Venda passada para ${result.afiliado.nome}.${result.vendaConfirmada ? ` Comissão: ${money(result.valorComissao)}.` : ' A comissão sai para ele quando o pagamento confirmar.'}` : 'Venda passada para venda direta. A comissão pendente foi cancelada.');
      setOpen(false); setTarget(''); setReason('');
      await onDone();
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível transferir a venda.'); }
    finally { setBusy(false); }
  }
  return <div className="share-sale">
    <span>{current ? <><strong>{current.usuario?.nome ?? current.codigoAfiliado}</strong><small>{current.codigoAfiliado}{item.comissao ? ` · comissão ${money(item.comissao.valor)} ${item.comissao.status === 'paga' ? 'paga' : item.comissao.status === 'cancelada' ? 'cancelada' : 'a pagar'}` : ''}</small></> : <span className="admin-muted">Venda direta</span>}</span>
    {canTransfer && !open && <button type="button" className="admin-button admin-button-small admin-button-ghost" onClick={() => setOpen(true)}>Trocar afiliado</button>}
    {!canTransfer && item.comissao?.status === 'paga' && <small className="admin-muted">Comissão já paga: não transfere.</small>}
    {open && <div className="share-sale-form">
      <select value={target} disabled={busy} onChange={(event) => setTarget(event.target.value)} aria-label="Novo afiliado da venda">
        <option value="">Escolha quem fez a venda…</option>
        {current && <option value="direta">Venda direta (sem afiliado)</option>}
        {affiliates.filter((row) => row.id !== current?.id).map((row) => <option key={row.id} value={row.id}>{row.nome} · {row.codigo} · {Number(row.pct).toLocaleString('pt-BR')}%</option>)}
      </select>
      <input value={reason} maxLength={300} disabled={busy} placeholder="Motivo (opcional)" onChange={(event) => setReason(event.target.value)} />
      <div className="share-sale-actions"><button type="button" className="admin-button admin-button-small admin-button-primary" disabled={busy || !target} onClick={() => void save()}>{busy ? 'Salvando…' : 'Transferir venda'}</button><button type="button" className="admin-button admin-button-small admin-button-ghost" disabled={busy} onClick={() => { setOpen(false); setTarget(''); }}>Cancelar</button></div>
    </div>}
  </div>;
}
