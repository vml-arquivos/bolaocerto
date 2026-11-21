'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { AdminModal } from './admin-attachments';
import { dateOnly, dateTime, fetchAdmin } from './admin-views/shared';
import type { RecordValue } from './admin-views/shared';
import { deviceInfo, mapLink } from '../lib/device-info';

type Notify = (type: 'success' | 'error', text: string) => void;
type Tab = 'aguardando' | 'assinado' | 'cancelado' | '';
const TABS: ReadonlyArray<readonly [Tab, string]> = [['aguardando', 'Aguardando assinatura'], ['assinado', 'Assinados'], ['cancelado', 'Cancelados'], ['', 'Todos']];
const KINDS: Record<string, string> = { afiliado: 'Contrato de afiliado', 'aditivo-bonificacao': 'Termo aditivo (bonificação)' };
const STATUS_TEXT: Record<string, string> = { aguardando: 'Aguardando afiliado', assinado: 'Assinado', cancelado: 'Cancelado' };
const STATUS_CLASS: Record<string, string> = { aguardando: 'status-chip status-warning', assinado: 'status-chip status-success', cancelado: 'status-chip status-danger' };
const EVENT_TEXT: Record<string, string> = { gerado: 'Contrato gerado', aviso_enviado: 'Aviso enviado ao afiliado', lembrete_enviado: 'Lembrete enviado', codigo_enviado: 'Código enviado para', codigo_incorreto: 'Código incorreto digitado', assinado: 'Assinado por', empresa_assinou: 'Assinatura da empresa', cancelado: 'Cancelado' };
const ORIGIN_TEXT: Record<string, string> = { cadastro: 'automático (cadastro)', automatico: 'automático', painel: 'pelo painel' };

const COMPANY_FIELDS: ReadonlyArray<readonly [key: string, label: string, wide?: boolean]> = [
  ['razaoSocial', 'Razão social', true], ['cnpj', 'CNPJ'], ['nire', 'NIRE'], ['endereco', 'Endereço da sede', true], ['registroJunta', 'Registro do contrato social', true], ['marca', 'Marca'],
  ['representanteNome', 'Representante legal', true], ['representanteCargo', 'Cargo'], ['representanteCpf', 'CPF do representante'], ['representanteRg', 'RG do representante'],
  ['representanteNacionalidade', 'Nacionalidade'], ['representanteEstadoCivil', 'Estado civil'], ['representanteProfissao', 'Profissão'], ['cidade', 'Cidade do contrato'], ['foro', 'Foro'], ['prazoAvisoDias', 'Aviso prévio para rescisão (dias)'],
];

async function openPdf(id: string, notify: Notify) {
  try {
    const response = await fetch(`/api/v1/admin/contratos/${id}/pdf`, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error('Não foi possível gerar o PDF.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const name = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'contrato.pdf';
    const link = document.createElement('a');
    link.href = url; link.download = name; link.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível gerar o PDF.'); }
}

/** Empresa que assina os contratos: dados do contratante e do representante legal, e a assinatura do modelo. */
function CompanyCard({ notify, onSigned }: { notify: Notify; onSigned: () => void }) {
  const [data, setData] = useState<RecordValue | null>(null);
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<RecordValue>({});
  const [busy, setBusy] = useState(false);
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState('');
  const load = useCallback(async () => { const result = await fetchAdmin('/api/v1/admin/contratos-empresa'); setData(result); setForm(result.dados); }, []);
  useEffect(() => { void load().catch((error) => notify('error', error.message)); }, [load, notify]);

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const result = await fetchAdmin('/api/v1/admin/contratos-empresa', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ ...form, prazoAvisoDias: Number(form.prazoAvisoDias) || 30 }) });
      setData(result); setForm(result.dados); setEditing(false);
      notify('success', result.aprovacao ? 'Dados salvos.' : 'Dados salvos. Assine de novo o modelo para os próximos contratos.');
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar.'); } finally { setBusy(false); }
  }
  async function sendCode() {
    setBusy(true);
    try { const result = await fetchAdmin('/api/v1/admin/contratos-empresa/codigo', { method: 'POST' }); setCodeSentTo(result.email); setCode(''); notify('success', `Código enviado para ${result.email}.`); }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível enviar o código.'); } finally { setBusy(false); }
  }
  async function sign(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      const dispositivo = await deviceInfo();
      const result = await fetchAdmin('/api/v1/admin/contratos-empresa/assinar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ codigo: code, dispositivo }) });
      setData(result); setCodeSentTo(null); setCode('');
      notify('success', result.contratosAtualizados ? `Modelo assinado. ${result.contratosAtualizados} ${result.contratosAtualizados === 1 ? 'contrato recebeu' : 'contratos receberam'} a assinatura da empresa.` : 'Modelo assinado.');
      onSigned();
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível assinar.'); } finally { setBusy(false); }
  }

  if (!data) return <section className="admin-panel contracts-company"><p>Carregando…</p></section>;
  const d = data.dados as RecordValue;
  const approval = data.aprovacao as RecordValue | null;
  return <section className="admin-panel contracts-company" aria-label="Empresa que assina">
    <div className="contracts-company-head">
      <div>
        <h2>Empresa que assina</h2>
        <p><strong>{d.razaoSocial}</strong> · CNPJ {d.cnpj}</p>
        <p>Representante: <strong>{d.representanteNome}</strong> ({d.representanteCargo}) · CPF {d.representanteCpf} · RG {d.representanteRg}</p>
      </div>
      <div className="contracts-company-sign">
        {approval
          ? <><span className="status-chip status-success">Modelo assinado</span><small>{dateTime(approval.em)} · {approval.nome}</small></>
          : <><span className="status-chip status-warning">Assinatura da empresa pendente</span>{data.aprovacaoAnterior && <small>Os dados mudaram depois da última assinatura.</small>}</>}
        <div className="admin-row-actions">
          {!approval && !codeSentTo && <button type="button" className="admin-button admin-button-small admin-button-primary" disabled={busy} onClick={() => void sendCode()}>Assinar como empresa</button>}
          <button type="button" className="admin-button admin-button-small admin-button-ghost" onClick={() => setEditing((value) => !value)}>{editing ? 'Fechar' : 'Conferir dados'}</button>
        </div>
      </div>
    </div>
    {codeSentTo && !approval && <form className="contracts-code-form" onSubmit={sign}>
      <label><span>Código enviado para {codeSentTo}</span><input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" /></label>
      <button type="submit" className="admin-button admin-button-primary" disabled={busy || code.length !== 6}>{busy ? 'Assinando…' : 'Confirmar assinatura'}</button>
      <button type="button" className="admin-button admin-button-ghost" disabled={busy} onClick={() => void sendCode()}>Reenviar código</button>
    </form>}
    {editing && <form className="contracts-company-form" onSubmit={save}>
      {COMPANY_FIELDS.map(([key, label, wide]) => <label key={key} className={wide ? 'is-wide' : undefined}><span>{label}</span><input type={key === 'prazoAvisoDias' ? 'number' : 'text'} min={key === 'prazoAvisoDias' ? 1 : undefined} max={key === 'prazoAvisoDias' ? 365 : undefined} value={form[key] ?? ''} onChange={(event) => setForm({ ...form, [key]: event.target.value })} /></label>)}
      <div className="contracts-company-actions"><button type="submit" className="admin-button admin-button-primary" disabled={busy}>Salvar dados</button><button type="button" className="admin-button admin-button-ghost" onClick={() => { setForm(d); setEditing(false); }}>Cancelar</button></div>
    </form>}
  </section>;
}

function GenerateDialog({ notify, onClose, onDone }: { notify: Notify; onClose: () => void; onDone: () => void }) {
  const [options, setOptions] = useState<RecordValue[] | null>(null);
  const [affiliateId, setAffiliateId] = useState('');
  const [kind, setKind] = useState('afiliado');
  const [filter, setFilter] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { void fetchAdmin('/api/v1/admin/contratos/afiliados').then(setOptions).catch((error) => notify('error', error.message)); }, [notify]);
  const list = (options ?? []).filter((item) => !filter.trim() || `${item.nome} ${item.codigo}`.toLowerCase().includes(filter.trim().toLowerCase()));
  async function submit(event: FormEvent) {
    event.preventDefault(); if (!affiliateId) return; setBusy(true);
    try {
      const created = await fetchAdmin('/api/v1/admin/contratos', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ afiliadoId: affiliateId, tipo: kind }) });
      notify('success', `Contrato ${created.numero} gerado e enviado ao afiliado.`);
      onDone();
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível gerar.'); } finally { setBusy(false); }
  }
  return <AdminModal title="Gerar contrato" onClose={onClose}>
    <form className="contracts-generate" onSubmit={submit}>
      <label><span>Documento</span><select value={kind} onChange={(event) => setKind(event.target.value)}>{Object.entries(KINDS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label><span>Buscar afiliado</span><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Nome ou código" /></label>
      <label><span>Afiliado</span><select required value={affiliateId} onChange={(event) => setAffiliateId(event.target.value)} size={Math.min(8, Math.max(3, list.length))}>
        {!options && <option value="">Carregando…</option>}
        {list.map((item) => <option key={item.id} value={item.id}>{item.nome} ({item.codigo}){item.contrato === 'assinado' ? ' · contrato assinado' : item.contrato === 'aguardando' ? ' · aguardando assinatura' : ' · sem contrato'}</option>)}
      </select></label>
      <p className="admin-muted-note">O documento sai preenchido com os dados do afiliado e da empresa. O afiliado recebe o aviso para assinar.</p>
      <div className="contracts-company-actions"><button type="submit" className="admin-button admin-button-primary" disabled={busy || !affiliateId}>{busy ? 'Gerando…' : 'Gerar e enviar'}</button><button type="button" className="admin-button admin-button-ghost" onClick={onClose}>Cancelar</button></div>
    </form>
  </AdminModal>;
}

function DetailDialog({ id, notify, onClose, onChanged }: { id: string; notify: Notify; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<RecordValue | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => setData(await fetchAdmin(`/api/v1/admin/contratos/${id}`)), [id]);
  useEffect(() => { void load().catch((error) => notify('error', error.message)); }, [load, notify]);
  async function remind() {
    setBusy(true);
    try { await fetchAdmin(`/api/v1/admin/contratos/${id}/lembrar`, { method: 'POST' }); notify('success', 'Lembrete enviado ao afiliado.'); await load(); }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível enviar.'); } finally { setBusy(false); }
  }
  async function cancel(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try { await fetchAdmin(`/api/v1/admin/contratos/${id}/cancelar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ motivo: reason }) }); notify('success', 'Contrato cancelado.'); setCancelling(false); await load(); onChanged(); }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível cancelar.'); } finally { setBusy(false); }
  }
  const signature = (data?.assinatura ?? null) as RecordValue | null;
  const company = (data?.empresaAssinatura ?? null) as RecordValue | null;
  const map = signature ? mapLink(signature.latitude, signature.longitude) : null;
  return <AdminModal title={data ? `${data.titulo} · ${data.numero}` : 'Contrato'} onClose={onClose}>
    {!data ? <p>Carregando…</p> : <div className="contracts-detail">
      <div className="contracts-detail-grid">
        <div><span>Situação</span><strong><span className={STATUS_CLASS[data.status] ?? 'status-chip'}>{STATUS_TEXT[data.status] ?? data.status}</span></strong></div>
        <div><span>Afiliado</span><strong>{data.afiliado?.nome}</strong><small>{data.afiliado?.codigo} · CPF {data.afiliado?.cpf ?? '—'}</small></div>
        <div><span>Gerado em</span><strong>{dateTime(data.criadoEm)}</strong><small>{ORIGIN_TEXT[data.origem] ?? data.origem}</small></div>
        <div><span>Assinatura do afiliado</span><strong>{data.assinadoEm ? dateTime(data.assinadoEm) : '—'}</strong></div>
        <div><span>Assinatura da empresa</span><strong>{data.empresaAssinadaEm ? dateTime(data.empresaAssinadaEm) : 'Pendente'}</strong>{company && <small>{company.nome}</small>}</div>
        <div className="is-wide"><span>Código de verificação (SHA-256)</span><code>{data.hash}</code></div>
      </div>
      {signature && <div className="contracts-evidence">
        <h3>Registro da assinatura</h3>
        <dl>
          <dt>E-mail do código</dt><dd>{signature.email}</dd>
          <dt>IP</dt><dd>{signature.ip}{signature.ipsEncaminhados && signature.ipsEncaminhados !== signature.ip ? ` (${signature.ipsEncaminhados})` : ''}</dd>
          <dt>Local</dt><dd>{map ? <a href={map} target="_blank" rel="noreferrer">{signature.latitude}, {signature.longitude}{typeof signature.precisaoMetros === 'number' ? ` (± ${signature.precisaoMetros} m)` : ''}</a> : signature.localizacao ?? '—'}</dd>
          <dt>Aparelho</dt><dd>{signature.userAgent ?? '—'}</dd>
          <dt>Fuso e idioma</dt><dd>{[signature.fuso, signature.idioma].filter(Boolean).join(' · ') || '—'}</dd>
        </dl>
      </div>}
      {data.status === 'cancelado' && <p className="form-message form-error">Cancelado em {dateTime(data.canceladoEm)}{data.motivoCancelamento ? `: ${data.motivoCancelamento}` : ''}</p>}
      <div className="contracts-events"><h3>Histórico</h3><ol>{(data.eventos as RecordValue[] ?? []).map((event, index) => <li key={index}><time>{dateTime(event.em)}</time><span>{EVENT_TEXT[event.evento] ?? event.evento}{event.detalhe && event.evento !== 'gerado' ? ` ${event.detalhe}` : event.evento === 'gerado' && event.detalhe ? ` (${ORIGIN_TEXT[event.detalhe] ?? event.detalhe})` : ''}{event.ip ? ` · IP ${event.ip}` : ''}</span></li>)}</ol></div>
      <details className="contracts-text"><summary>Ler o texto do contrato</summary><pre>{data.texto}</pre></details>
      <div className="admin-row-actions contracts-detail-actions">
        <button type="button" className="admin-button admin-button-primary" onClick={() => void openPdf(id, notify)}>Baixar PDF</button>
        {data.status === 'aguardando' && <button type="button" className="admin-button" disabled={busy} onClick={() => void remind()}>Lembrar afiliado</button>}
        {data.status !== 'cancelado' && !cancelling && <button type="button" className="admin-button admin-button-ghost" onClick={() => setCancelling(true)}>Cancelar contrato</button>}
      </div>
      {cancelling && <form className="contracts-cancel" onSubmit={cancel}>
        <label><span>Motivo do cancelamento</span><input required minLength={3} maxLength={300} value={reason} onChange={(event) => setReason(event.target.value)} /></label>
        <button type="submit" className="admin-button admin-button-danger" disabled={busy || reason.trim().length < 3}>Confirmar cancelamento</button>
        <button type="button" className="admin-button admin-button-ghost" onClick={() => setCancelling(false)}>Voltar</button>
      </form>}
    </div>}
  </AdminModal>;
}

/** Tela "Contratos": contratos dos afiliados, gerados no cadastro ou pelo painel, com a assinatura de cada parte. */
export function ContractsAdminView({ notify }: { notify: Notify }) {
  const [tab, setTab] = useState<Tab>('aguardando');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [data, setData] = useState<RecordValue | null>(null);
  const [loading, setLoading] = useState(true);
  const [generating, setGenerating] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const load = useCallback(async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams({ page: String(page) });
      if (tab) query.set('status', tab);
      if (search.trim()) query.set('busca', search.trim());
      setData(await fetchAdmin(`/api/v1/admin/contratos?${query.toString()}`));
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível carregar.'); } finally { setLoading(false); }
  }, [tab, page, search, notify]);
  useEffect(() => { void load(); }, [tab, page]); // eslint-disable-line react-hooks/exhaustive-deps

  async function generateMissing() {
    if (!window.confirm('Gerar o contrato para todos os afiliados aprovados que ainda não têm? Cada um recebe o aviso para assinar.')) return;
    setBusy(true);
    try { const result = await fetchAdmin('/api/v1/admin/contratos/gerar-pendentes', { method: 'POST' }); notify('success', result.gerados ? `${result.gerados} ${result.gerados === 1 ? 'contrato gerado' : 'contratos gerados'}.` : 'Todos os afiliados já têm contrato.'); await load(); }
    catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível gerar.'); } finally { setBusy(false); }
  }

  const resumo: RecordValue = data?.resumo ?? {};
  const items: RecordValue[] = data?.items ?? [];
  const pages = data?.pagination?.pages ?? 1;
  const count = (key: Tab) => (key ? resumo[key] ?? 0 : (resumo.aguardando ?? 0) + (resumo.assinado ?? 0) + (resumo.cancelado ?? 0));
  return <section className="admin-section contracts-view">
    <div className="admin-page-heading">
      <div><h1>Contratos</h1><p className="admin-muted-note">Contratos dos afiliados com assinatura eletrônica.</p></div>
      <div className="admin-row-actions"><button type="button" className="admin-button admin-button-primary" onClick={() => setGenerating(true)}>Gerar contrato</button><button type="button" className="admin-button admin-button-ghost" disabled={busy} onClick={() => void generateMissing()}>Gerar para quem não tem</button></div>
    </div>
    <CompanyCard notify={notify} onSigned={() => void load()} />
    <nav className="pool-status-tabs report-tabs comm-tabs" aria-label="Situação dos contratos">
      {TABS.map(([key, label]) => <button key={key || 'todos'} type="button" className={`report-tab ${tab === key ? 'is-current' : ''}`} aria-pressed={tab === key} onClick={() => { setTab(key); setPage(1); }}>{label}<span className="pool-tab-count">{count(key)}</span></button>)}
    </nav>
    <div className="comm-filters" role="search">
      <label className="comm-filter-search"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') { setPage(1); void load(); } }} placeholder="Número, nome, código, e-mail ou CPF" /></label>
      <div className="comm-filter-actions"><button type="button" className="admin-button admin-button-ghost" onClick={() => { setPage(1); void load(); }}>Buscar</button></div>
      {(resumo.empresaPendente ?? 0) > 0 && <p className="contracts-pending-note"><span className="status-chip status-warning">{resumo.empresaPendente} sem a assinatura da empresa</span></p>}
    </div>
    <div className="admin-panel">
      {loading ? <div className="admin-loading"><span className="admin-spinner" /><p>Carregando…</p></div> : items.length === 0 ? <div className="admin-empty"><strong>Nenhum contrato aqui.</strong></div> :
        <div className="admin-table-scroll"><table className="admin-table" style={{ minWidth: 900 }}>
          <thead><tr><th>Número</th><th>Afiliado</th><th>Documento</th><th>Situação</th><th>Gerado</th><th>Assinado</th><th>Ações</th></tr></thead>
          <tbody>{items.map((item) => <tr key={item.id}>
            <td data-label="Número" className="td-nowrap"><code>{item.numero}</code></td>
            <td data-label="Afiliado"><strong>{item.afiliado?.nome}</strong><small>{item.afiliado?.codigo}{item.afiliado?.email ? ` · ${item.afiliado.email}` : ''}</small></td>
            <td data-label="Documento">{KINDS[item.tipo] ?? item.titulo}</td>
            <td data-label="Situação"><span className={STATUS_CLASS[item.status] ?? 'status-chip'}>{STATUS_TEXT[item.status] ?? item.status}</span>{item.status !== 'cancelado' && !item.empresaAssinadaEm && <small>empresa pendente</small>}</td>
            <td data-label="Gerado" className="td-nowrap">{dateOnly(item.criadoEm)}</td>
            <td data-label="Assinado" className="td-nowrap">{item.assinadoEm ? dateTime(item.assinadoEm) : '—'}</td>
            <td data-label="Ações"><div className="admin-row-actions"><button type="button" className="admin-button admin-button-small" onClick={() => setOpenId(item.id)}>Ver</button><button type="button" className="admin-button admin-button-small admin-button-ghost" onClick={() => void openPdf(item.id, notify)}>PDF</button></div></td>
          </tr>)}</tbody>
        </table></div>}
      {pages > 1 && <div className="contracts-pagination"><button type="button" className="admin-button admin-button-small" disabled={page <= 1} onClick={() => setPage(page - 1)}>Anterior</button><span>Página {page} de {pages}</span><button type="button" className="admin-button admin-button-small" disabled={page >= pages} onClick={() => setPage(page + 1)}>Próxima</button></div>}
    </div>
    {generating && <GenerateDialog notify={notify} onClose={() => setGenerating(false)} onDone={() => { setGenerating(false); setTab('aguardando'); setPage(1); void load(); }} />}
    {openId && <DetailDialog id={openId} notify={notify} onClose={() => setOpenId(null)} onChanged={() => void load()} />}
  </section>;
}
