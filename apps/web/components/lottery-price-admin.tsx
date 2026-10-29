'use client';
import { useEffect, useState } from 'react';
type Price = { id: string; modalidade: string; chave: string; valorCentavos: number; fonte: string; verificadoEm: string };
export function LotteryPriceAdmin() {
  const [rows, setRows] = useState<Price[]>([]);
  const [selected, setSelected] = useState('');
  const [amount, setAmount] = useState('');
  const [source, setSource] = useState('');
  const [message, setMessage] = useState('');
  const [busy, setBusy] = useState(false);
  async function load() {
    const response = await fetch('/api/v1/loterias/precos');
    if (!response.ok) throw new Error('Não foi possível consultar a tabela.');
    setRows(await response.json());
  }
  useEffect(() => { void load().catch(e => setMessage(e.message)); }, []);
  const row = rows.find(r => r.id === selected);
  async function save() {
    if (!row || !amount) return;
    setBusy(true); setMessage('');
    try {
      const response = await fetch(`/api/v1/admin/loterias/precos/${row.modalidade}/${encodeURIComponent(row.chave)}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ valorCentavos: Math.round(Number(amount) * 100), fonte: source }) });
      const data = await response.json();
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message);
      await load(); setSelected(data.id);
      setMessage('Nova versão salva. Os orçamentos já criados foram preservados. Refaça a cotação antes de criar um bolão.');
    } catch (e) { setMessage(e instanceof Error ? e.message : 'Falha ao salvar.'); } finally { setBusy(false); }
  }
  return <details className="admin-callout"><summary>Tabela Caixa — consultar e versionar preços</summary>
    <p>Atualize somente após conferir a fonte oficial. As alterações ficam na auditoria.</p>
    <label className="admin-field">Modalidade / combinação<select value={selected} onChange={e => { const p = rows.find(r => r.id === e.target.value); setSelected(e.target.value); setAmount(p ? (p.valorCentavos / 100).toFixed(2) : ''); setSource(p?.fonte ?? ''); }}><option value="">Selecione</option>{rows.map(r => <option key={r.id} value={r.id}>{r.modalidade} · {r.chave} · R$ {(r.valorCentavos / 100).toFixed(2)}</option>)}</select></label>
    {row && <><p>Verificado em {new Date(row.verificadoEm).toLocaleDateString('pt-BR')} · <a href={row.fonte} target="_blank" rel="noreferrer">Fonte oficial</a></p><label className="admin-field">Novo preço (R$)<input type="number" min="0.01" step="0.01" value={amount} onChange={e => setAmount(e.target.value)} /></label><label className="admin-field">URL oficial<input type="url" value={source} onChange={e => setSource(e.target.value)} /></label><button type="button" disabled={busy} onClick={() => void save()}>Registrar nova versão</button></>}
    {message && <p role="status">{message}</p>}
  </details>;
}
