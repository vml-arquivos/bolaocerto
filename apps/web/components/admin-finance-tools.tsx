'use client';

import { FormEvent, ReactNode, useCallback, useEffect, useState } from 'react';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Rec = Record<string, any>;

const brl = (value: unknown) => new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value ?? 0));
const dateTime = (value: unknown) => (value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(String(value))) : '—');
const label = (value: unknown) => String(value ?? '—').replaceAll('_', ' ');
function chip(status: unknown) {
  const s = String(status ?? '').toLowerCase();
  if (['paga', 'pago', 'confirmado', 'registrada', 'apurada', 'premiada'].includes(s)) return 'status-chip status-success';
  if (['pendente', 'reservada', 'reservada (vencida)', 'sem cobrança'].includes(s)) return 'status-chip status-warning';
  if (['falhou', 'cancelada', 'estornado', 'estornada'].includes(s)) return 'status-chip status-danger';
  return 'status-chip';
}

async function authFetch(path: string, options?: RequestInit) {
  let response = await fetch(path, { ...options, credentials: 'include' });
  if (response.status === 401) {
    const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (refresh.ok) response = await fetch(path, { ...options, credentials: 'include' });
  }
  return response;
}

async function api<T = Rec>(path: string, options?: RequestInit): Promise<T> {
  const response = await authFetch(path, options);
  if (response.status === 401) { window.location.href = '/login?next=/admin'; throw new Error('Sessão expirada.'); }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message || 'Não foi possível concluir a operação.');
  return payload as T;
}

async function download(path: string) {
  const response = await authFetch(path);
  if (!response.ok) {
    const payload = await response.json().catch(() => ({}));
    throw new Error(Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message || 'Falha ao gerar o arquivo.');
  }
  const disposition = response.headers.get('content-disposition') ?? '';
  const name = /filename="([^"]+)"/.exec(disposition)?.[1] ?? 'relatorio';
  const url = URL.createObjectURL(await response.blob());
  const anchor = document.createElement('a');
  anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function Panel({ title, description, action, children }: { title: string; description?: string; action?: ReactNode; children: ReactNode }) {
  return <section className="admin-panel"><div className="admin-panel-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>{children}</section>;
}
function Kpi({ label: title, value, hint, tone = 'blue' }: { label: string; value: string | number; hint?: string; tone?: 'blue' | 'violet' | 'green' | 'amber' | 'rose' }) {
  return <article className={`admin-kpi admin-kpi-${tone}`}><span className="admin-kpi-icon" aria-hidden="true">{tone === 'green' ? '↗' : tone === 'amber' ? '!' : tone === 'rose' ? '◎' : tone === 'violet' ? '◆' : '◌'}</span><div><span>{title}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div></article>;
}
function Table({ children, minWidth = 900 }: { children: ReactNode; minWidth?: number }) {
  return <div className="admin-table-scroll"><table className="admin-table" style={{ minWidth }}>{children}</table></div>;
}
function Empty({ text }: { text: string }) {
  return <div className="admin-empty"><span>BL</span><strong>{text}</strong></div>;
}

/* -------------------------------------------------------------------------- */
/* Relatórios                                                                 */
/* -------------------------------------------------------------------------- */

type Tab = 'resumo' | 'vendas' | 'nao-pagos' | 'comissoes' | 'boloes';
const TABS: Array<[Tab, string]> = [['resumo', 'Resumo financeiro'], ['vendas', 'Vendas de cotas'], ['nao-pagos', 'Quem não pagou'], ['comissoes', 'Comissões'], ['boloes', 'Por bolão']];

export function ReportsView() {
  const [tab, setTab] = useState<Tab>('resumo');
  const [de, setDe] = useState('');
  const [ate, setAte] = useState('');
  const [status, setStatus] = useState('');
  const [data, setData] = useState<Rec | null>(null);
  const [list, setList] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [exporting, setExporting] = useState('');
  const [error, setError] = useState('');

  const query = useCallback((extra: Record<string, string> = {}) => {
    const params = new URLSearchParams(extra);
    if (de) params.set('de', de);
    if (ate) params.set('ate', ate);
    if (status && tab === 'vendas') params.set('status', status);
    return params.toString();
  }, [de, ate, status, tab]);

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      if (tab === 'resumo') setData(await api(`/api/v1/admin/relatorios/resumo?${query()}`));
      else if (tab === 'boloes') setList(await api<Rec[]>(`/api/v1/admin/relatorios/boloes?${query()}`));
      else setData(await api(`/api/v1/admin/relatorios/${tab}?${query()}`));
    } catch (failure) { setError(failure instanceof Error ? failure.message : 'Falha ao carregar o relatório.'); }
    finally { setLoading(false); }
  }, [tab, query]);
  useEffect(() => { void load(); }, [load]);

  async function exportFile(path: string, format: 'csv' | 'xlsx', key: string) {
    setExporting(`${key}-${format}`); setError('');
    try { await download(`${path}${path.includes('?') ? '&' : '?'}${query({ formato: format })}`); }
    catch (failure) { setError(failure instanceof Error ? failure.message : 'Falha ao exportar.'); }
    finally { setExporting(''); }
  }
  const ExportButtons = ({ path, id }: { path: string; id: string }) => <div className="admin-row-actions">
    <button className="admin-button admin-button-small" disabled={Boolean(exporting)} onClick={() => void exportFile(path, 'xlsx', id)}>{exporting === `${id}-xlsx` ? 'Gerando…' : 'Baixar planilha (XLSX)'}</button>
    <button className="admin-button admin-button-small admin-button-ghost" disabled={Boolean(exporting)} onClick={() => void exportFile(path, 'csv', id)}>{exporting === `${id}-csv` ? 'Gerando…' : 'CSV'}</button>
  </div>;

  const summary = tab === 'resumo' ? data : null;
  const rows: Rec[] = tab === 'vendas' || tab === 'nao-pagos' || tab === 'comissoes' ? (data?.linhas ?? []) : [];

  return <>
    <div className="admin-page-heading"><div><span className="admin-eyebrow">Financeiro e controle</span><h1>Relatórios</h1><p>Receita, comissões, inadimplência e planilhas completas para conferência e prestação de contas.</p></div></div>
    <div className="admin-toolbar"><div className="admin-toolbar-filters">
      <label className="admin-field"><span>De</span><input type="date" value={de} onChange={(event) => setDe(event.target.value)} /></label>
      <label className="admin-field"><span>Até</span><input type="date" value={ate} onChange={(event) => setAte(event.target.value)} /></label>
      {tab === 'vendas' && <label className="admin-field"><span>Status da cota</span><select value={status} onChange={(event) => setStatus(event.target.value)}><option value="">Todos</option>{['reservada', 'paga', 'registrada', 'apurada', 'premiada', 'cancelada', 'estornada'].map((item) => <option key={item} value={item}>{label(item)}</option>)}</select></label>}
      <button className="admin-button" onClick={() => { setDe(''); setAte(''); setStatus(''); }}>Limpar</button>
    </div></div>
    <div className="wizard-steps" role="tablist" aria-label="Relatórios">{TABS.map(([key, title]) => <button key={key} role="tab" aria-selected={tab === key} className={`wizard-step ${tab === key ? 'is-current' : ''}`} onClick={() => setTab(key)}><span>{title}</span></button>)}</div>
    {error && <div className="admin-toast admin-toast-error" role="alert">{error}</div>}
    {loading && <div className="admin-spinner" aria-label="Carregando" />}

    {!loading && summary && <>
      {Number(summary.pagamentosSemCotaParaEstorno) > 0 && <div className="admin-toast admin-toast-error" role="alert"><strong>{summary.pagamentosSemCotaParaEstorno} pagamento(s) recebido(s) sem cota</strong> (reserva expirou e o bolão lotou). Devolva o valor ao participante e registre o estorno em “Quem não pagou”.</div>}
      <div className="admin-kpi-grid">
        <Kpi label="Receita bruta" value={brl(summary.receitaBruta)} hint={`${summary.pagamentosConfirmados} pagamentos confirmados`} tone="green" />
        <Kpi label="Custo dos jogos" value={brl(summary.custoJogos)} hint="valor destinado às apostas" tone="blue" />
        <Kpi label="Taxa de administração" value={brl(summary.taxaAdministracao)} tone="violet" />
        <Kpi label="Comissões (total)" value={brl(summary.comissoes?.total)} hint={`${brl(summary.comissoes?.pendente)} a pagar · ${brl(summary.comissoes?.paga)} pagas`} tone="amber" />
        <Kpi label="Resultado da plataforma" value={brl(summary.resultadoLiquidoPlataforma)} hint="taxa − comissões" tone="green" />
        <Kpi label="Ticket médio" value={brl(summary.ticketMedio)} tone="blue" />
        <Kpi label="A receber (no prazo)" value={brl(summary.aReceber?.valorAguardando)} hint="reservas aguardando pagamento" tone="amber" />
        <Kpi label="Vencido sem pagar" value={brl(summary.aReceber?.valorVencido)} hint="reservas com prazo expirado" tone="rose" />
      </div>
      <div className="admin-dashboard-grid">
        <Panel title="Recebimentos por forma de pagamento"><Table minWidth={420}><thead><tr><th>Forma</th><th>Pagamentos</th><th>Valor</th></tr></thead><tbody>{(summary.porMetodo ?? []).map((row: Rec) => <tr key={row.metodo}><td>{label(row.metodo)}</td><td>{row.pagamentos}</td><td>{brl(row.valor)}</td></tr>)}</tbody></Table>{!(summary.porMetodo ?? []).length && <Empty text="Nenhum pagamento confirmado no período" />}</Panel>
        <Panel title="Cotas por situação"><Table minWidth={420}><thead><tr><th>Status</th><th>Registros</th><th>Cotas</th></tr></thead><tbody>{(summary.cotasPorStatus ?? []).map((row: Rec) => <tr key={row.status}><td><span className={chip(row.status)}>{label(row.status)}</span></td><td>{row.registros}</td><td>{row.cotas}</td></tr>)}</tbody></Table>{!(summary.cotasPorStatus ?? []).length && <Empty text="Nenhuma cota no período" />}</Panel>
      </div>
    </>}

    {!loading && tab === 'vendas' && <Panel title="Vendas de cotas" description={`${data?.total ?? 0} registros (a planilha traz todos os campos, inclusive CPF completo)`} action={<ExportButtons path="/api/v1/admin/relatorios/vendas" id="vendas" />}>
      <Table minWidth={1240}><thead><tr><th>Data</th><th>Participante</th><th>CPF</th><th>Bolão</th><th>Qtd.</th><th>Total</th><th>Cota</th><th>Pagamento</th><th>Forma</th><th>Pago em</th><th>Afiliado</th><th>Comissão</th></tr></thead><tbody>{rows.map((row, index) => <tr key={index}><td>{dateTime(row.criadoEm)}</td><td><strong>{row.participante}</strong><small>{row.email}</small></td><td>{row.cpf}</td><td>{label(row.modalidade)} #{row.concurso}<small>{row.grupo}</small></td><td>{row.quantidade}</td><td>{brl(row.valorTotal)}</td><td><span className={chip(row.statusCota)}>{label(row.statusCota)}</span></td><td><span className={chip(row.statusPagamento)}>{label(row.statusPagamento)}</span></td><td>{label(row.metodo)} <small>{row.origem}</small></td><td>{dateTime(row.pagoEm)}</td><td>{row.afiliado ?? 'Orgânico'}</td><td>{row.comissao === null || row.comissao === undefined ? '—' : brl(row.comissao)}</td></tr>)}</tbody></Table>
      {!rows.length && <Empty text="Nenhuma venda no período" />}
    </Panel>}

    {!loading && tab === 'nao-pagos' && <>
      <Panel title="Quem não pagou" description={`${data?.total ?? 0} cotas aguardando pagamento ou com reserva vencida`} action={<ExportButtons path="/api/v1/admin/relatorios/nao-pagos" id="nao-pagos" />}>
        <Table minWidth={1080}><thead><tr><th>Reservada em</th><th>Participante</th><th>Contato</th><th>Bolão</th><th>Qtd.</th><th>Valor</th><th>Situação</th><th>Vencimento</th></tr></thead><tbody>{rows.map((row, index) => <tr key={index}><td>{dateTime(row.criadoEm)}</td><td><strong>{row.participante}</strong></td><td>{row.email}<small>{row.telefone ?? ''}</small></td><td>{label(row.modalidade)} #{row.concurso}</td><td>{row.quantidade}</td><td>{brl(row.valorTotal)}</td><td><span className={chip(row.statusCota)}>{label(row.statusCota)}</span></td><td>{dateTime(row.vencimento)}</td></tr>)}</tbody></Table>
        {!rows.length && <Empty text="Ninguém inadimplente no período" />}
      </Panel>
      {(data?.pagosSemCota ?? []).length > 0 && <Panel title="Pagos sem cota — estornar ao participante" description="Pagamentos confirmados cuja reserva já havia expirado e o bolão lotou.">
        <Table minWidth={760}><thead><tr><th>Participante</th><th>Bolão</th><th>Valor pago</th><th>Pago em</th></tr></thead><tbody>{(data?.pagosSemCota ?? []).map((row: Rec, index: number) => <tr key={index}><td>{row.participante}<small>{row.email}</small></td><td>{label(row.modalidade)} #{row.concurso}</td><td>{brl(row.valorTotal)}</td><td>{dateTime(row.pagoEm)}</td></tr>)}</tbody></Table>
      </Panel>}
    </>}

    {!loading && tab === 'comissoes' && <Panel title="Comissões por afiliado" description="Base de cálculo = taxa de administração das vendas pagas." action={<ExportButtons path="/api/v1/admin/relatorios/comissoes" id="comissoes" />}>
      <Table minWidth={960}><thead><tr><th>Afiliado</th><th>Código</th><th>Chave Pix</th><th>%</th><th>Vendas</th><th>Base</th><th>A pagar</th><th>Paga</th><th>Cancelada</th></tr></thead><tbody>{rows.map((row, index) => <tr key={index}><td><strong>{row.afiliado}</strong></td><td>{row.codigo}</td><td>{row.chavePix ?? '—'}</td><td>{row.percentual}%</td><td>{row.vendas}</td><td>{brl(row.base)}</td><td>{brl(row.pendente)}</td><td>{brl(row.paga)}</td><td>{brl(row.cancelada)}</td></tr>)}</tbody></Table>
      {!rows.length && <Empty text="Nenhuma comissão no período" />}
    </Panel>}

    {!loading && tab === 'boloes' && <Panel title="Resultado por bolão" description="Baixe a ficha completa de cada bolão: participantes, pagamentos, jogos e totais.">
      <Table minWidth={1100}><thead><tr><th>Bolão</th><th>Sorteio</th><th>Status</th><th>Cotas pagas</th><th>Aguardando</th><th>Canceladas</th><th>Receita</th><th>Ficha</th></tr></thead><tbody>{list.map((pool) => <tr key={pool.id}><td><strong>{label(pool.modalidade)} #{pool.concurso}</strong><small>{pool.grupo} · {brl(pool.valorCota)}/cota</small></td><td>{dateTime(pool.sorteio)}</td><td><span className="status-chip">{label(pool.status)}</span></td><td>{pool.cotasPagas}{pool.totalCotas ? ` / ${pool.totalCotas}` : ' (ilimitadas)'}</td><td>{pool.cotasAguardando}</td><td>{pool.cotasCanceladas}</td><td>{brl(pool.receita)}</td><td><ExportButtons path={`/api/v1/admin/relatorios/boloes/${pool.id}`} id={pool.id} /></td></tr>)}</tbody></Table>
      {!list.length && <Empty text="Nenhum bolão no período" />}
    </Panel>}
  </>;
}

/* -------------------------------------------------------------------------- */
/* Ações sobre cotas: baixa manual, cancelamento, venda de balcão             */
/* -------------------------------------------------------------------------- */

const FORMS: Array<[string, string]> = [['pix_direto', 'Pix direto'], ['dinheiro', 'Dinheiro'], ['transferencia', 'Transferência'], ['cartao_maquininha', 'Cartão (maquininha)'], ['outro', 'Outro']];

export function ShareActions({ item, onDone, notify }: { item: Rec; onDone: () => Promise<void> | void; notify: (type: 'success' | 'error', text: string) => void }) {
  const [mode, setMode] = useState<'' | 'baixa' | 'cancelar'>('');
  const [forma, setForma] = useState('pix_direto');
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const canPay = ['reservada', 'cancelada'].includes(String(item.status)) && item.pagamento?.status !== 'confirmado';
  const canCancel = ['reservada', 'paga'].includes(String(item.status));
  if (!canPay && !canCancel) return <span className="muted">—</span>;

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      if (mode === 'baixa') await api(`/api/v1/admin/cotas/${item.id}/baixa`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ forma, observacao: text || undefined }) });
      else await api(`/api/v1/admin/cotas/${item.id}/cancelar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ motivo: text || undefined }) });
      notify('success', mode === 'baixa' ? 'Pagamento registrado e cota confirmada.' : 'Cota cancelada.');
      setMode(''); setText(''); await onDone();
    } catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível concluir.'); }
    finally { setBusy(false); }
  }

  if (!mode) return <div className="admin-row-actions">
    {canPay && <button className="admin-button admin-button-small admin-button-primary" onClick={() => setMode('baixa')}>Dar baixa</button>}
    {canCancel && <button className="admin-button admin-button-small admin-button-ghost" onClick={() => setMode('cancelar')}>Cancelar</button>}
  </div>;
  return <form onSubmit={submit} className="admin-inline-form" style={{ display: 'grid', gap: 6, minWidth: 220 }}>
    {mode === 'baixa' && <select aria-label="Forma de pagamento" value={forma} onChange={(event) => setForma(event.target.value)}>{FORMS.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select>}
    <input aria-label="Observação" placeholder={mode === 'baixa' ? 'Observação (opcional)' : 'Motivo (opcional)'} value={text} maxLength={300} onChange={(event) => setText(event.target.value)} />
    <div className="admin-row-actions"><button className="admin-button admin-button-small admin-button-primary" disabled={busy}>{busy ? 'Salvando…' : mode === 'baixa' ? 'Confirmar recebimento' : 'Confirmar cancelamento'}</button><button type="button" className="admin-button admin-button-small admin-button-ghost" onClick={() => setMode('')}>Voltar</button></div>
  </form>;
}

export function ManualSaleForm({ onDone, notify }: { onDone: () => Promise<void> | void; notify: (type: 'success' | 'error', text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [pools, setPools] = useState<Rec[]>([]);
  const [users, setUsers] = useState<Rec[]>([]);
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);
  const [paid, setPaid] = useState(true);
  useEffect(() => { if (!open) return; void api('/api/v1/admin/boloes?page=1&pageSize=100&status=aberto').then((result) => setPools(result.items ?? [])).catch(() => setPools([])); }, [open]);
  useEffect(() => {
    if (!open || search.trim().length < 2) { setUsers([]); return; }
    const timer = window.setTimeout(() => { void api(`/api/v1/admin/usuarios?page=1&pageSize=20&busca=${encodeURIComponent(search.trim())}`).then((result) => setUsers(result.items ?? [])).catch(() => setUsers([])); }, 300);
    return () => window.clearTimeout(timer);
  }, [open, search]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/v1/admin/cotas/venda-manual', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({
        bolaoId: String(form.get('bolaoId')), usuarioId: String(form.get('usuarioId')), quantidade: Number(form.get('quantidade')), pago: paid,
        forma: paid ? String(form.get('forma')) : undefined, codigoAfiliado: String(form.get('codigoAfiliado') || '') || undefined,
        observacao: String(form.get('observacao') || '') || undefined, aceiteTermoConfirmado: form.get('aceite') === 'on',
      }) });
      notify('success', paid ? 'Venda registrada e paga.' : 'Reserva criada. Dê baixa quando o pagamento for recebido.');
      setOpen(false); await onDone();
    } catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível registrar a venda.'); }
    finally { setBusy(false); }
  }

  if (!open) return <button className="admin-button admin-button-primary" onClick={() => setOpen(true)}>Registrar venda de balcão</button>;
  return <Panel title="Venda de balcão" description="Para participantes que pagam em dinheiro, Pix direto ou transferência. O participante precisa ter cadastro (Usuários)." action={<button className="admin-button admin-button-small admin-button-ghost" onClick={() => setOpen(false)}>Fechar</button>}>
    <form onSubmit={submit} className="admin-form-grid" style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(220px,1fr))' }}>
      <label className="admin-field"><span>Bolão aberto</span><select name="bolaoId" required>{pools.map((pool) => <option key={pool.id} value={pool.id}>{label(pool.concurso?.modalidade)} #{pool.concurso?.numeroConcurso} — {brl(pool.valorCota)}/cota</option>)}</select></label>
      <label className="admin-field"><span>Buscar participante (nome, CPF ou e-mail)</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Digite ao menos 2 letras" /></label>
      <label className="admin-field"><span>Participante</span><select name="usuarioId" required>{users.map((user) => <option key={user.id} value={user.id}>{user.nome} — {user.email}</option>)}</select></label>
      <label className="admin-field"><span>Quantidade de cotas</span><input name="quantidade" type="number" min={1} defaultValue={1} required /></label>
      <label className="admin-field"><span>Código do afiliado (opcional)</span><input name="codigoAfiliado" maxLength={20} /></label>
      <label className="admin-field"><span>Situação</span><select value={paid ? 'pago' : 'pendente'} onChange={(event) => setPaid(event.target.value === 'pago')}><option value="pago">Já pago</option><option value="pendente">Reservar (pagará depois)</option></select></label>
      {paid && <label className="admin-field"><span>Forma de pagamento</span><select name="forma" defaultValue="pix_direto">{FORMS.map(([value, title]) => <option key={value} value={value}>{title}</option>)}</select></label>}
      <label className="admin-field"><span>Observação</span><input name="observacao" maxLength={300} /></label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center', gridColumn: '1 / -1' }}><input name="aceite" type="checkbox" required /> Confirmo que o participante leu e aceitou o termo de participação.</label>
      <div style={{ gridColumn: '1 / -1' }}><button className="admin-button admin-button-primary" disabled={busy}>{busy ? 'Registrando…' : 'Registrar venda'}</button></div>
    </form>
  </Panel>;
}

/* -------------------------------------------------------------------------- */
/* Configuração de pagamentos (Cora) e concurso manual                        */
/* -------------------------------------------------------------------------- */

export function PaymentSettingsPanel({ notify }: { notify: (type: 'success' | 'error', text: string) => void }) {
  const [settings, setSettings] = useState<Rec | null>(null);
  const [busy, setBusy] = useState('');
  useEffect(() => { void api('/api/v1/admin/pagamentos/configuracao').then(setSettings).catch(() => setSettings(null)); }, []);
  async function run(path: string, success: (result: Rec) => string, key: string) {
    setBusy(key);
    try { notify('success', success(await api(path, { method: 'POST' }))); }
    catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Falha na operação.'); }
    finally { setBusy(''); }
  }
  if (!settings) return null;
  return <Panel title="Pagamentos (Cora)" description="Estado do provedor, sem expor credenciais.">
    <div className="admin-summary-list">
      <div><span>Pagamentos habilitados</span><strong>{settings.habilitado ? 'Sim' : 'Não'}</strong></div>
      <div><span>Provedor</span><strong>{settings.provedor}{settings.ambienteCora ? ` (${settings.ambienteCora === 'production' ? 'produção' : 'homologação'})` : ''}</strong></div>
      <div><span>Formas disponíveis</span><strong>{(settings.metodos ?? []).map(label).join(', ') || '—'}</strong></div>
      <div><span>Valor mínimo por cobrança</span><strong>{brl(settings.valorMinimo)}</strong></div>
      <div><span>Boleto: vencimento / antecedência mínima</span><strong>{settings.boletoVencimentoDias} dias / {settings.boletoAntecedenciaMinimaHoras} h antes do corte</strong></div>
      <div><span>URL do webhook</span><strong style={{ wordBreak: 'break-all' }}>{settings.webhookUrl ?? 'Defina PUBLIC_API_URL'}</strong></div>
      <div><span>Token do webhook</span><strong>{settings.webhookTokenConfigurado ? 'Configurado' : 'Não configurado (recomendado)'}</strong></div>
    </div>
    <div className="admin-row-actions" style={{ marginTop: 12 }}>
      {settings.provedor === 'cora' && <button className="admin-button" disabled={Boolean(busy)} onClick={() => void run('/api/v1/admin/pagamentos/cora/webhooks', (result) => `Webhooks cadastrados na Cora (${(result.resultados ?? []).map((item: Rec) => `${item.trigger}: HTTP ${item.status}`).join(', ')}).`, 'webhook')}>{busy === 'webhook' ? 'Cadastrando…' : 'Cadastrar webhooks na Cora'}</button>}
      <button className="admin-button admin-button-ghost" disabled={Boolean(busy)} onClick={() => void run('/api/v1/admin/pagamentos/conciliar', (result) => `Conciliação: ${result.verificados} verificados, ${result.confirmados} confirmados, ${result.cancelados} cancelados, ${result.erros} erros.`, 'reconcile')}>{busy === 'reconcile' ? 'Conciliando…' : 'Conciliar pagamentos agora'}</button>
    </div>
  </Panel>;
}

export function ManualContestForm({ onDone, notify }: { onDone: () => Promise<void> | void; notify: (type: 'success' | 'error', text: string) => void }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true);
    const form = new FormData(event.currentTarget);
    try {
      await api('/api/v1/admin/concursos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ modalidade: String(form.get('modalidade')), numeroConcurso: Number(form.get('numeroConcurso')), dataSorteio: String(form.get('dataSorteio')), acumulado: form.get('acumulado') === 'on' }) });
      notify('success', 'Concurso cadastrado.'); setOpen(false); await onDone();
    } catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível cadastrar o concurso.'); }
    finally { setBusy(false); }
  }
  if (!open) return <button className="admin-button" onClick={() => setOpen(true)}>Cadastrar concurso manualmente</button>;
  return <Panel title="Novo concurso (manual)" description="Use quando a sincronização com a CAIXA estiver indisponível. O horário de corte é calculado pela configuração da modalidade." action={<button className="admin-button admin-button-small admin-button-ghost" onClick={() => setOpen(false)}>Fechar</button>}>
    <form onSubmit={submit} style={{ display: 'grid', gap: 12, gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))' }}>
      <label className="admin-field"><span>Modalidade</span><select name="modalidade" required>{['megasena', 'lotofacil', 'quina', 'lotomania', 'duplasena', 'timemania', 'diadesorte', 'supersete', 'loteca'].map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      <label className="admin-field"><span>Número do concurso</span><input name="numeroConcurso" type="number" min={1} required /></label>
      <label className="admin-field"><span>Data do sorteio</span><input name="dataSorteio" type="date" required /></label>
      <label style={{ display: 'flex', gap: 8, alignItems: 'center' }}><input name="acumulado" type="checkbox" /> Acumulado</label>
      <div><button className="admin-button admin-button-primary" disabled={busy}>{busy ? 'Salvando…' : 'Cadastrar concurso'}</button></div>
    </form>
  </Panel>;
}
