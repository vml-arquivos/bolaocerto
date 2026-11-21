'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { authenticatedFetch } from '../lib/client-api';
import { deviceInfo } from '../lib/device-info';

type Contract = { id: string; numero: string; tipo: string; titulo: string; status: 'aguardando' | 'assinado' | 'cancelado'; criadoEm: string; assinadoEm: string | null; hash: string; texto: string; empresaAssinadaEm: string | null; codigoEnviadoEm: string | null; codigoValido: boolean };
type Payload = { email: string | null; items: Contract[]; pendentes: number };

async function call<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await authenticatedFetch(path, { cache: 'no-store', ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'Não foi possível concluir.');
  return data as T;
}

const when = (value: string | null) => (value ? new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : '—');

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

/** Aviso no início do app quando há contrato para assinar. */
export function AffiliateContractBanner() {
  const [pending, setPending] = useState(0);
  useEffect(() => { void call<Payload>('/api/v1/afiliados/me/contratos').then((data) => setPending(data.pendentes)).catch(() => undefined); }, []);
  if (!pending) return null;
  return <section className="affiliate-table-card aff-contract-banner" role="status">
    <div><strong>Seu contrato está pronto para assinar</strong><p>Já está preenchido com os seus dados. Leia e confirme com o código que chega no seu e-mail.</p></div>
    <Link className="button button-primary" href="/afiliado?aba=contrato">Ver e assinar</Link>
  </section>;
}

function SignBox({ contract, email, onSigned }: { contract: Contract; email: string | null; onSigned: () => Promise<void> }) {
  const [agreed, setAgreed] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(contract.codigoValido ? email : null);
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState<'' | 'code' | 'sign'>('');
  const [message, setMessage] = useState<{ type: 'ok' | 'error'; text: string } | null>(null);

  async function sendCode() {
    setBusy('code'); setMessage(null);
    try {
      const result = await call<{ email: string }>(`/api/v1/afiliados/me/contratos/${contract.id}/codigo`, { method: 'POST' });
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
      await call(`/api/v1/afiliados/me/contratos/${contract.id}/assinar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ codigo: code, dispositivo }) });
      await onSigned();
    } catch (error) { setMessage({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível assinar.' }); }
    finally { setBusy(''); }
  }

  return <div className="aff-contract-sign">
    <label className="aff-contract-agree"><input type="checkbox" checked={agreed} onChange={(event) => setAgreed(event.target.checked)} /><span>Li o contrato e concordo com todas as cláusulas.</span></label>
    {!sentTo
      ? <button type="button" className="button button-primary" disabled={!agreed || busy !== ''} onClick={() => void sendCode()}>{busy === 'code' ? 'Enviando…' : 'Receber código no e-mail'}</button>
      : <form className="aff-contract-code" onSubmit={sign}>
        <label><span>Código enviado para {sentTo}</span><input inputMode="numeric" autoComplete="one-time-code" pattern="\d{6}" maxLength={6} required value={code} onChange={(event) => setCode(event.target.value.replace(/\D/g, '').slice(0, 6))} placeholder="000000" aria-label="Código de 6 números" /></label>
        <button type="submit" className="button button-primary" disabled={!agreed || code.length !== 6 || busy !== ''}>{busy === 'sign' ? 'Assinando…' : 'Assinar contrato'}</button>
        <button type="button" className="button button-secondary" disabled={busy !== ''} onClick={() => void sendCode()}>Reenviar código</button>
      </form>}
    <p className="aff-contract-note">Ao assinar, registramos data, hora, IP e aparelho. O navegador pode pedir a sua localização.</p>
    {message && <div className={`form-message ${message.type === 'ok' ? 'form-success' : 'form-error'}`} role="status">{message.text}</div>}
  </div>;
}

/** Aba "Contrato" do app do afiliado: ler, assinar com o código do e-mail e baixar o PDF. */
export function AffiliateContract() {
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  const load = useCallback(async () => { setData(await call<Payload>('/api/v1/afiliados/me/contratos')); }, []);
  useEffect(() => { void load().catch((reason) => setError(reason instanceof Error ? reason.message : 'Não foi possível carregar o contrato.')); }, [load]);

  if (error && !data) return <section className="affiliate-table-card"><div className="form-message form-error">{error}</div></section>;
  if (!data) return <section className="affiliate-table-card"><p>Carregando…</p></section>;
  return <div className="aff-contracts">
    {done && <div className="form-message form-success" role="status">{done}</div>}
    {error && <div className="form-message form-error" role="status">{error}</div>}
    {data.items.length === 0 && <section className="affiliate-table-card"><div className="affiliate-empty"><strong>Nenhum contrato por aqui.</strong></div></section>}
    {data.items.map((contract) => <section key={contract.id} className="affiliate-table-card aff-contract">
      <div className="affiliate-card-heading">
        <div><h2>{contract.titulo}</h2><p>Nº {contract.numero} · gerado em {when(contract.criadoEm)}</p></div>
        <span className={`affiliate-status ${contract.status === 'assinado' ? 'aprovado' : 'pendente'}`}>{contract.status === 'assinado' ? 'Assinado' : 'Aguardando sua assinatura'}</span>
      </div>
      {contract.status === 'assinado'
        ? <div className="aff-contract-done"><p>Assinado em <strong>{when(contract.assinadoEm)}</strong>.</p><p className="aff-contract-hash">Código de verificação: <code>{contract.hash}</code></p></div>
        : null}
      <details className="aff-contract-text" open={contract.status === 'aguardando'}>
        <summary>{contract.status === 'aguardando' ? 'Contrato' : 'Ler o contrato'}</summary>
        <pre tabIndex={0}>{contract.texto}</pre>
      </details>
      {contract.status === 'aguardando' && <SignBox contract={contract} email={data.email} onSigned={async () => { setDone('Contrato assinado. A cópia em PDF foi enviada para o seu e-mail e fica disponível aqui.'); setError(''); await load(); }} />}
      <div className="affiliate-row-actions"><button type="button" onClick={() => void downloadPdf(contract.id, setError)}>{contract.status === 'assinado' ? 'Baixar contrato assinado (PDF)' : 'Baixar PDF'}</button></div>
    </section>)}
  </div>;
}
