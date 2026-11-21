'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from '../lib/client-api';
import { deviceInfo } from '../lib/device-info';
import type { IdReading } from '../lib/id-check';

type Contract = { id: string; numero: string; tipo: string; titulo: string; status: 'aguardando' | 'assinado' | 'cancelado'; criadoEm: string; assinadoEm: string | null; hash: string; texto: string; empresaAssinadaEm: string | null; codigoEnviadoEm: string | null; codigoValido: boolean };
type DataValues = Record<string, string>;
type ContractData = { valores: DataValues; faltando: Array<{ campo: string; rotulo: string }>; completo: boolean; estadosCivis: string[] };
type DocFile = { nome: string; mime: string; ext: string; bytes: number; enviadoEm: string; leitura: IdReading | null };
type IdDoc = { situacao: 'pendente' | 'incompleto' | 'em_analise' | 'conferido' | 'aprovado' | 'recusado'; rotulo: string; frente: DocFile | null; verso: DocFile | null; precisaVerso: boolean; achou: Record<string, boolean | null>; revisao: { aprovado: boolean; motivo: string | null; em: string } | null };
type Payload = { email: string | null; items: Contract[]; pendentes: number; codigoValido?: boolean; dados?: ContractData; documento?: IdDoc | null };

const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'];

async function call<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(path, { cache: 'no-store', ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'Não foi possível concluir.');
  return data as T;
}

const when = (value: string | null) => (value ? new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');
const docDone = (doc: IdDoc | null | undefined) => Boolean(doc && ['em_analise', 'conferido', 'aprovado'].includes(doc.situacao));

async function downloadPdf(id: string, onError: (text: string) => void) {
  try {
    const response = await authenticatedFetch(`/api/v1/afiliados/me/contratos/${id}/pdf`, { cache: 'no-store' });
    if (!response.ok) throw new Error('Não foi possível baixar o contrato.');
    const blob = await response.blob();
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = response.headers.get('content-disposition')?.match(/filename="([^"]+)"/)?.[1] ?? 'contrato.pdf';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  } catch (error) { onError(error instanceof Error ? error.message : 'Não foi possível baixar o contrato.'); }
}

/** Aviso no início do app quando há contrato para assinar ou documento para enviar. */
export function AffiliateContractBanner() {
  const [state, setState] = useState<{ pending: number; doc: boolean } | null>(null);
  useEffect(() => { void call<Payload>('/api/v1/afiliados/me/contratos').then((data) => setState({ pending: data.pendentes, doc: data.documento !== undefined && !docDone(data.documento) })).catch(() => undefined); }, []);
  if (!state || (!state.pending && !state.doc)) return null;
  const title = state.pending > 1 ? 'Seu contrato e o aditivo estão prontos para assinar' : state.pending === 1 ? 'Seu contrato está pronto para assinar' : 'Falta enviar seu documento de identidade';
  const text = state.pending ? 'Confira seus dados, leia e confirme com o código que chega no seu e-mail.' : 'Envie a frente e o verso do RG ou da CNH. Pode ser foto ou PDF.';
  return <section className="affiliate-table-card aff-contract-banner" role="status">
    <div><strong>{title}</strong><p>{text}</p></div>
    <Link className="button button-primary" href="/afiliado?aba=contrato">{state.pending ? 'Ver e assinar' : 'Enviar documento'}</Link>
  </section>;
}

// ---------- 1. Dados ----------

function DataForm({ data, onSaved, startOpen }: { data: ContractData; onSaved: (next: ContractData) => void; startOpen: boolean }) {
  const [values, setValues] = useState<DataValues>(data.valores);
  const [open, setOpen] = useState(startOpen);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const missing = new Set(data.faltando.map((item) => item.campo));
  const set = (key: string) => (event: { target: { value: string } }) => setValues((current) => ({ ...current, [key]: event.target.value }));

  async function lookupCep() {
    const cep = (values.enderecoCep ?? '').replace(/\D/g, '');
    if (cep.length !== 8) return;
    try {
      const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`);
      const found = await response.json() as { erro?: boolean; logradouro?: string; bairro?: string; localidade?: string; uf?: string };
      if (found.erro) return;
      setValues((current) => ({ ...current, enderecoLogradouro: current.enderecoLogradouro || found.logradouro || '', enderecoBairro: current.enderecoBairro || found.bairro || '', enderecoCidade: found.localidade || current.enderecoCidade || '', enderecoUf: found.uf || current.enderecoUf || '' }));
    } catch { /* sem consulta de CEP: a pessoa digita */ }
  }

  async function save(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setMessage(null);
    try {
      const { nome: _n, cpf: _c, email: _e, ...body } = values;
      const next = await call<ContractData & { refeitos: number }>('/api/v1/afiliados/me/contratos/dados', { method: 'PUT', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
      setValues(next.valores);
      onSaved(next);
      if (next.completo) { setOpen(false); setMessage({ type: 'ok', text: next.refeitos ? 'Dados salvos. O contrato já foi atualizado com eles.' : 'Dados salvos.' }); }
      else setMessage({ type: 'error', text: `Ainda falta: ${next.faltando.map((item) => item.rotulo).join(', ')}.` });
    } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível salvar.' }); }
    finally { setBusy(false); }
  }

  const field = (key: string, label: string, props: Record<string, unknown> = {}) => <label className={`aff-field${missing.has(key) ? ' is-missing' : ''}`}>
    <span>{label}</span>
    <input value={values[key] ?? ''} onChange={set(key)} {...props} />
  </label>;
  const select = (key: string, label: string, options: string[]) => <label className={`aff-field${missing.has(key) ? ' is-missing' : ''}`}>
    <span>{label}</span>
    <select value={values[key] ?? ''} onChange={set(key)}><option value="">Escolha</option>{options.map((option) => <option key={option} value={option}>{option}</option>)}</select>
  </label>;

  if (!open) return <div className="aff-data-summary">
    <p><strong>{values.nome}</strong> · CPF {values.cpf} · RG {values.rg} {values.rgOrgao}{values.rgUf ? `/${values.rgUf}` : ''}</p>
    <p>{[values.enderecoLogradouro, values.enderecoNumero, values.enderecoBairro, values.enderecoCidade && `${values.enderecoCidade}/${values.enderecoUf}`].filter(Boolean).join(', ')}</p>
    <button type="button" className="button button-secondary button-small" onClick={() => setOpen(true)}>Corrigir dados</button>
    {message && <div className={`form-message ${message.type === 'ok' ? 'form-success' : 'form-error'}`} role="status">{message.text}</div>}
  </div>;

  return <form className="aff-data-form" onSubmit={save}>
    <div className="aff-data-grid">
      {field('nome', 'Nome completo', { readOnly: true, className: 'is-readonly' })}
      {field('cpf', 'CPF', { readOnly: true, className: 'is-readonly' })}
      {field('dataNascimento', 'Data de nascimento', { type: 'date', required: true, max: new Date().toISOString().slice(0, 10) })}
      {field('telefone', 'Celular com DDD', { inputMode: 'tel', autoComplete: 'tel', required: true, placeholder: '(61) 99999-9999' })}
      {field('rg', 'Número do RG', { required: true, autoComplete: 'off' })}
      {field('rgOrgao', 'Órgão emissor', { required: true, placeholder: 'SSP', maxLength: 20 })}
      {select('rgUf', 'UF do RG', UFS)}
      {field('nacionalidade', 'Nacionalidade', { required: true, maxLength: 40 })}
      {select('estadoCivil', 'Estado civil', data.estadosCivis)}
      {field('profissao', 'Profissão', { required: true, maxLength: 60 })}
      {field('enderecoCep', 'CEP', { inputMode: 'numeric', autoComplete: 'postal-code', required: true, onBlur: () => void lookupCep() })}
      {field('enderecoLogradouro', 'Rua / avenida', { required: true, autoComplete: 'address-line1' })}
      {field('enderecoNumero', 'Número', { required: true })}
      {field('enderecoComplemento', 'Complemento')}
      {field('enderecoBairro', 'Bairro', { required: true })}
      {field('enderecoCidade', 'Cidade', { required: true, autoComplete: 'address-level2' })}
      {select('enderecoUf', 'UF', UFS)}
    </div>
    <p className="aff-contract-note">Nome e CPF vêm do seu cadastro. Se estiverem errados, fale com a administração.</p>
    <div className="aff-data-actions"><button type="submit" className="button button-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar dados'}</button></div>
    {message && <div className={`form-message ${message.type === 'ok' ? 'form-success' : 'form-error'}`} role="status">{message.text}</div>}
  </form>;
}

// ---------- 2. Assinatura ----------

function SignBox({ count, email, codeValid, disabled, onSigned }: { count: number; email: string | null; codeValid: boolean; disabled: boolean; onSigned: () => Promise<void> }) {
  const [agreed, setAgreed] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(codeValid ? email : null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'' | 'code' | 'sign'>('');
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);
  const both = count > 1;

  async function sendCode() {
    setBusy('code'); setMessage(null);
    try {
      const result = await call<{ email: string }>('/api/v1/afiliados/me/contratos/codigo', { method: 'POST' });
      setSentTo(result.email); setCode('');
      setMessage({ type: 'ok', text: `Enviamos um código de 6 números para ${result.email}. Ele vale por 15 minutos.` });
    } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível enviar o código.' }); }
    finally { setBusy(''); }
  }

  async function sign(event: FormEvent) {
    event.preventDefault();
    setBusy('sign'); setMessage(null);
    try {
      const dispositivo = await deviceInfo();
      await call('/api/v1/afiliados/me/contratos/assinar', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ codigo: code, dispositivo }) });
      await onSigned();
    } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível assinar.' }); }
    finally { setBusy(''); }
  }

  return <div className="aff-contract-sign">
    <label className="aff-contract-agree"><input type="checkbox" checked={agreed} disabled={disabled} onChange={(event) => setAgreed(event.target.checked)} /><span>{both ? 'Li o contrato e o aditivo e concordo com todas as cláusulas.' : 'Li o documento e concordo com todas as cláusulas.'}</span></label>
    {!sentTo
      ? <button type="button" className="button button-primary" disabled={disabled || !agreed || busy !== ''} onClick={() => void sendCode()}>{busy === 'code' ? 'Enviando…' : 'Receber código no e-mail'}</button>
      : <form className="aff-contract-code" onSubmit={sign}>
        <label><span>Código enviado para {sentTo}</span><input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" aria-label="Código de 6 números" /></label>
        <button type="submit" className="button button-primary" disabled={disabled || !agreed || code.length !== 6 || busy !== ''}>{busy === 'sign' ? 'Assinando…' : both ? 'Assinar os 2 documentos' : 'Assinar'}</button>
        <button type="button" className="button button-secondary" disabled={busy !== ''} onClick={() => void sendCode()}>Reenviar código</button>
      </form>}
    <p className="aff-contract-note">{both ? 'Um só código assina os dois. ' : ''}Ao assinar, registramos data, hora, IP e aparelho. O navegador pode pedir a sua localização.</p>
    {message && <div className={`form-message ${message.type === 'ok' ? 'form-success' : 'form-error'}`} role="status">{message.text}</div>}
  </div>;
}

// ---------- 3. Documento de identidade ----------

const FOUND_LABELS: Array<[string, string]> = [['nome', 'Nome'], ['cpf', 'CPF'], ['rg', 'RG'], ['nascimento', 'Nascimento']];

function SidePicker({ side, file, touch, busy, onPick }: { side: 'frente' | 'verso'; file: DocFile | null; touch: boolean; busy: boolean; onPick: (side: 'frente' | 'verso', file: File) => void }) {
  const camera = useRef<HTMLInputElement>(null);
  const picker = useRef<HTMLInputElement>(null);
  const pick = (event: { target: HTMLInputElement }) => { const chosen = event.target.files?.[0]; event.target.value = ''; if (chosen) onPick(side, chosen); };
  const reading = file?.leitura;
  return <div className={`aff-doc-side${file ? ' has-file' : ''}`}>
    <div className="aff-doc-side-head">
      <strong>{side === 'frente' ? 'Frente' : 'Verso'}</strong>
      {file ? <span className={`affiliate-status ${reading?.legivel === false ? 'pendente' : 'aprovado'}`}>{reading?.legivel === false ? 'Difícil de ler' : 'Enviado'}</span> : <span className="affiliate-status pendente">Falta</span>}
    </div>
    {file && <p className="aff-doc-file"><a href={`/api/v1/afiliados/me/documento/${side}/arquivo`} target="_blank" rel="noreferrer">{file.nome}</a> · {when(file.enviadoEm)}</p>}
    {reading?.motivo && <p className={`aff-doc-hint${reading.legivel === false ? ' is-warn' : ''}`}>{reading.motivo}</p>}
    <div className="aff-doc-buttons">
      {touch && <button type="button" className="button button-primary button-small" disabled={busy} onClick={() => camera.current?.click()}>{file ? 'Tirar outra foto' : 'Tirar foto'}</button>}
      <button type="button" className={`button ${touch ? 'button-secondary' : 'button-primary'} button-small`} disabled={busy} onClick={() => picker.current?.click()}>{file ? 'Trocar arquivo' : touch ? 'Escolher arquivo' : 'Enviar arquivo'}</button>
    </div>
    <input ref={camera} type="file" accept="image/*" capture="environment" hidden onChange={pick} />
    <input ref={picker} type="file" accept="image/*,application/pdf,.pdf,.heic,.heif" hidden onChange={pick} />
  </div>;
}

function IdentityDocument({ doc, data, onChange }: { doc: IdDoc; data: ContractData | undefined; onChange: (next: IdDoc) => void }) {
  const [touch, setTouch] = useState(false);
  const [busy, setBusy] = useState('');
  const [error, setError] = useState('');
  useEffect(() => { setTouch(window.matchMedia?.('(pointer: coarse)').matches ?? false); }, []);

  async function upload(side: 'frente' | 'verso', file: File) {
    setError('');
    if (!/^image\//.test(file.type) && file.type !== 'application/pdf' && !/\.(pdf|heic|heif|jpe?g|png|webp|gif|bmp|tiff?|avif)$/i.test(file.name)) { setError('Envie uma foto ou um PDF.'); return; }
    try {
      setBusy('Conferindo a foto…');
      const { analyzeIdFile } = await import('../lib/id-check-browser');
      const v = data?.valores ?? {};
      const result = await analyzeIdFile(file, { nome: v.nome ?? '', cpf: v.cpf ?? '', rg: v.rg ?? '', nascimento: v.dataNascimento ?? '' }, setBusy);
      setBusy('Enviando…');
      const form = new FormData();
      form.append('arquivo', result.upload, result.nome);
      form.append('leitura', JSON.stringify(result.leitura));
      onChange(await call<IdDoc>(`/api/v1/afiliados/me/documento/${side}`, { method: 'POST', body: form }));
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível enviar.'); }
    finally { setBusy(''); }
  }

  const tone = doc.situacao === 'aprovado' || doc.situacao === 'conferido' ? 'aprovado' : doc.situacao === 'em_analise' ? 'analise' : 'pendente';
  const anyFile = Boolean(doc.frente || doc.verso);
  return <section className="affiliate-table-card aff-doc">
    <div className="affiliate-card-heading">
      <div><h2>Documento de identidade</h2><p>RG ou CNH, frente e verso. Pode ser foto ou PDF.</p></div>
      <span className={`affiliate-status ${tone}`}>{doc.rotulo}</span>
    </div>
    {doc.situacao === 'recusado' && doc.revisao?.motivo && <div className="form-message form-error" role="status">Recusado: {doc.revisao.motivo}. Envie de novo.</div>}
    {!anyFile && <p className="aff-contract-note">Não precisa ser agora, mas é necessário para concluir o cadastro. Use boa luz, sem flash, com o documento inteiro na foto.</p>}
    <div className="aff-doc-sides">
      <SidePicker side="frente" file={doc.frente} touch={touch} busy={Boolean(busy)} onPick={(side, file) => void upload(side, file)} />
      {(doc.precisaVerso || doc.verso) && <SidePicker side="verso" file={doc.verso} touch={touch} busy={Boolean(busy)} onPick={(side, file) => void upload(side, file)} />}
    </div>
    {!doc.precisaVerso && !doc.verso && <p className="aff-contract-note">PDF com os dois lados: não precisa enviar o verso.</p>}
    {anyFile && doc.situacao !== 'aprovado' && <div className="aff-doc-found" aria-label="O que a leitura encontrou">
      {FOUND_LABELS.map(([key, label]) => <span key={key} className={`aff-doc-chip ${doc.achou[key] === true ? 'is-ok' : doc.achou[key] === false ? 'is-miss' : ''}`}>{doc.achou[key] === true ? '✓' : doc.achou[key] === false ? '✗' : '•'} {label}</span>)}
    </div>}
    {anyFile && doc.situacao === 'em_analise' && <p className="aff-contract-note">Nem tudo foi lido automaticamente. A administração vai conferir; se preferir, tire uma foto mais nítida.</p>}
    {busy && <div className="form-message form-success" role="status">{busy}</div>}
    {error && <div className="form-message form-error" role="status">{error}</div>}
  </section>;
}

/** Aba "Contrato" do app do afiliado: completar dados, ler e assinar o contrato e o aditivo, enviar o documento. */
export function AffiliateContract() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const load = useCallback(async () => { setData(await call<Payload>('/api/v1/afiliados/me/contratos')); }, []);
  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o contrato.')); }, [load]);

  if (error && !data) return <section className="affiliate-table-card"><div className="form-message form-error">{error}</div></section>;
  if (!data) return <section className="affiliate-table-card"><p>Carregando…</p></section>;
  const pending = data.items.filter((item) => item.status === 'aguardando');
  const signed = data.items.filter((item) => item.status === 'assinado');
  const complete = data.dados?.completo ?? true;
  const steps = [
    { label: 'Seus dados', ok: complete },
    { label: pending.length > 1 ? 'Assinar contrato e aditivo' : 'Assinar', ok: pending.length === 0 && signed.length > 0 },
    { label: 'Documento', ok: docDone(data.documento) },
  ];
  return <div className="aff-contracts">
    <ol className="aff-steps" aria-label="Etapas">{steps.map((step, index) => <li key={step.label} className={step.ok ? 'is-ok' : ''}><span>{step.ok ? '✓' : index + 1}</span>{step.label}</li>)}</ol>
    {done && <div className="form-message form-success" role="status">{done}</div>}
    {error && <div className="form-message form-error" role="status">{error}</div>}
    {data.dados && (pending.length > 0 || !complete) && <section className="affiliate-table-card aff-data">
      <div className="affiliate-card-heading">
        <div><h2>Seus dados para o contrato</h2><p>{complete ? 'Conferidos. Se algo estiver errado, corrija antes de assinar.' : 'Complete para liberar a assinatura.'}</p></div>
        <span className={`affiliate-status ${complete ? 'aprovado' : 'pendente'}`}>{complete ? 'Completo' : `Faltam ${data.dados.faltando.length}`}</span>
      </div>
      <DataForm data={data.dados} startOpen={!complete} onSaved={(next) => { setData((current) => current ? { ...current, dados: next } : current); void load(); }} />
    </section>}
    {data.items.length === 0 && <section className="affiliate-table-card"><div className="affiliate-empty"><strong>Nenhum contrato por aqui.</strong></div></section>}
    {data.items.map((contract) => <section key={contract.id} className="affiliate-table-card aff-contract">
      <div className="affiliate-card-heading">
        <div><h2>{contract.titulo}</h2><p>Nº {contract.numero} · gerado em {when(contract.criadoEm)}</p></div>
        <span className={`affiliate-status ${contract.status === 'assinado' ? 'aprovado' : 'pendente'}`}>{contract.status === 'assinado' ? 'Assinado' : 'Aguardando sua assinatura'}</span>
      </div>
      {contract.status === 'assinado'
        ? <div className="aff-contract-done"><p>Assinado em <strong>{when(contract.assinadoEm)}</strong>.</p><p className="aff-contract-hash">Código de verificação: <code>{contract.hash}</code></p></div>
        : null}
      <details className="aff-contract-text" open={contract.status === 'aguardando' && complete && pending[0]?.id === contract.id}>
        <summary>{contract.status === 'aguardando' ? 'Ler o documento' : 'Ler o documento assinado'}</summary>
        <pre tabIndex={0}>{contract.texto}</pre>
      </details>
      <div className="affiliate-row-actions"><button type="button" onClick={() => void downloadPdf(contract.id, setError)}>{contract.status === 'assinado' ? 'Baixar assinado (PDF)' : 'Baixar PDF'}</button></div>
    </section>)}
    {pending.length > 0 && <section className="affiliate-table-card aff-contract">
      <div className="affiliate-card-heading"><div><h2>{pending.length > 1 ? 'Assinar os 2 documentos' : 'Assinar'}</h2><p>{complete ? pending.map((item) => item.titulo).join(' e ') : 'Complete seus dados acima para liberar.'}</p></div></div>
      <SignBox key={pending.map((item) => item.hash).join()} count={pending.length} email={data.email} codeValid={Boolean(data.codigoValido)} disabled={!complete} onSigned={async () => { setDone(pending.length > 1 ? 'Contrato e aditivo assinados. As cópias em PDF foram enviadas para o seu e-mail e ficam aqui.' : 'Documento assinado. A cópia em PDF foi enviada para o seu e-mail e fica aqui.'); setError(''); await load(); }} />
    </section>}
    {data.documento && <IdentityDocument doc={data.documento} data={data.dados} onChange={(next) => setData((current) => current ? { ...current, documento: next } : current)} />}
  </div>;
}
