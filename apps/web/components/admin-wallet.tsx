'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, dateTime, Kpi, Notify, Panel, Rec, Table, Empty } from './admin-ui';

const cents = (value: unknown) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0) / 100);

/** Carteira dos clientes: cashback de indicação, créditos/reembolsos em crédito e o que há em aberto. */
export function WalletAdminView({ notify }: { notify: Notify }) {
  const [data, setData] = useState<Rec | null>(null);
  const [pct, setPct] = useState('');
  const [email, setEmail] = useState('');
  const [amount, setAmount] = useState('');
  const [kind, setKind] = useState<'reembolso' | 'bonus' | 'desconto'>('reembolso');
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const [filter, setFilter] = useState('');

  const load = useCallback(async (emailFilter = '') => {
    try {
      const result = await api(`/api/v1/admin/carteira${emailFilter ? `?email=${encodeURIComponent(emailFilter)}` : ''}`);
      setData(result); setPct(String(result.cashbackPct ?? 0).replace('.', ','));
    } catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível abrir a carteira.'); }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  async function saveCashback(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const value = Number(pct.replace(',', '.'));
      if (!Number.isFinite(value) || value < 0 || value > 100) throw new Error('Informe um percentual entre 0 e 100.');
      await api('/api/v1/admin/carteira/cashback', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ percentual: value }) });
      notify('success', value > 0 ? `Cashback de indicação ligado em ${value}% da taxa de administração.` : 'Cashback de indicação desligado.'); await load(filter);
    } catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível salvar.'); } finally { setBusy(false); }
  }

  async function adjust(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const value = Math.round(Number(amount.replace(/\./g, '').replace(',', '.')) * 100);
      if (!Number.isFinite(value) || value <= 0) throw new Error('Informe um valor maior que zero.');
      const debit = kind === 'desconto';
      if (debit && !window.confirm('Descontar este valor do saldo do cliente? A ação fica registrada na auditoria.')) { setBusy(false); return; }
      const result = await api('/api/v1/admin/carteira/ajuste', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email: email.trim(), valorCentavos: debit ? -value : value, motivo: reason.trim(), ...(kind === 'reembolso' ? { tipo: 'reembolso' } : kind === 'bonus' ? { tipo: 'bonus' } : {}) }) });
      notify('success', `Feito. Saldo de ${result.cliente}: ${cents(result.saldoCentavos)}.`);
      setAmount(''); setReason(''); await load(filter);
    } catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível lançar.'); } finally { setBusy(false); }
  }

  return <>
    <div className="admin-page-heading"><div><h1>Carteira dos clientes</h1></div></div>
    <div className="admin-kpi-grid">
      <Kpi label="Saldo total dos clientes" value={cents(data?.saldoEmAbertoCentavos)} tone="violet" />
      <Kpi label="Cashback de indicação" value={`${String(data?.cashbackPct ?? 0).replace('.', ',')}%`} tone={Number(data?.cashbackPct) > 0 ? 'green' : 'amber'} />
    </div>
    <div className="admin-two-col">
      <Panel title="Cashback de indicação">
        <form className="admin-form-grid" onSubmit={saveCashback}>
          <label className="admin-field"><span>Percentual da taxa (%)</span><input inputMode="decimal" value={pct} onChange={(event) => setPct(event.target.value)} required /></label>
          <button className="admin-button admin-button-primary" disabled={busy}>Salvar cashback</button>
        </form>
      </Panel>
      <Panel title="Lançar crédito ou reembolso">
        <form className="admin-form-grid" onSubmit={adjust}>
          <label className="admin-field"><span>E-mail do cliente</span><input type="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label>
          <label className="admin-field"><span>Tipo</span><select value={kind} onChange={(event) => setKind(event.target.value as typeof kind)}><option value="reembolso">Reembolso em crédito</option><option value="bonus">Crédito promocional (bônus)</option><option value="desconto">Descontar do saldo</option></select></label>
          <label className="admin-field"><span>Valor (R$)</span><input inputMode="decimal" required value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="25,00" /></label>
          <label className="admin-field"><span>Motivo (aparece no extrato do cliente)</span><input required minLength={5} maxLength={160} value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Ex.: devolução da cota do concurso 3300" /></label>
          <button className="admin-button admin-button-primary" disabled={busy}>Lançar</button>
        </form>
      </Panel>
    </div>
    <Panel title="Movimentos recentes" action={<form className="admin-row-actions" onSubmit={(event: FormEvent) => { event.preventDefault(); void load(filter.trim()); }}><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="E-mail do cliente" aria-label="Filtrar por e-mail" /><button className="admin-button admin-button-small admin-button-ghost" type="submit">Filtrar</button></form>}>
      <Table minWidth={640}><thead><tr><th>Quando</th><th>Cliente</th><th>Tipo</th><th>Valor</th><th>Motivo</th></tr></thead><tbody>{(data?.recentes ?? []).map((row: Rec) => <tr key={row.id}><td>{dateTime(row.em)}</td><td><strong>{row.cliente}</strong><small>{row.email}</small></td><td>{row.nome}</td><td><strong>{cents(row.valorCentavos)}</strong></td><td>{row.descricao ?? '—'}</td></tr>)}</tbody></Table>
      {!(data?.recentes ?? []).length && <Empty text="Nenhum movimento ainda" />}
    </Panel>
    {(data?.porTipo ?? []).length > 0 && <Panel title="Totais por tipo"><Table minWidth={420}><thead><tr><th>Tipo</th><th>Movimentos</th><th>Total</th></tr></thead><tbody>{data!.porTipo.map((row: Rec) => <tr key={row.tipo}><td>{row.nome}</td><td>{row.movimentos}</td><td>{cents(row.totalCentavos)}</td></tr>)}</tbody></Table></Panel>}
  </>;
}
