'use client';
import { useEffect, useState } from 'react';
export type LegalDocumentData = { texto: string; hash: string; versao: string; aprovado: boolean; aceitoEm?: string | null };
export function LegalDocument({ kind }: { kind: string }) {
  const [doc, setDoc] = useState<LegalDocumentData | null>(null);
  const [error, setError] = useState('');
  useEffect(() => { void fetch(`/api/v1/config/contratos/${kind}`, { cache: 'no-store' }).then(async response => { if (!response.ok) throw new Error('Documento indisponível.'); setDoc(await response.json()); }).catch(e => setError(e.message)); }, [kind]);
  return <>{error && <p role="alert">{error}</p>}{!doc && !error && <p>Carregando documento…</p>}{doc && <>{!doc.aprovado && <p className="notice">Minuta em revisão. Ainda não habilitada para contratação.</p>}<p>Versão {doc.versao}</p><div className="legal-text">{doc.texto}</div><details><summary>Identificador de integridade</summary><code>{doc.hash}</code></details><button className="button button-secondary" onClick={() => window.print()}>Imprimir / salvar PDF</button></>}</>;
}
export function AffiliateContract() {
  const [doc, setDoc] = useState<LegalDocumentData | null>(null);
  const [message, setMessage] = useState('');
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => { void fetch('/api/v1/afiliados/me/contrato', { credentials: 'include', cache: 'no-store' }).then(async r => { if (!r.ok) throw new Error('Contrato indisponível. Atualize a página após entrar na conta.'); setDoc(await r.json()); }).catch(e => setMessage(e.message)); }, []);
  async function accept() {
    if (!doc || !checked || busy) return;
    setBusy(true);
    try {
      const r = await fetch('/api/v1/afiliados/me/contrato/aceitar', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ hash: doc.hash, aceito: true }) });
      const result = await r.json(); if (!r.ok) throw new Error(result.message || 'Falha no aceite.');
      setDoc({ ...doc, aceitoEm: result.aceitoEm }); setMessage('Contrato aceito e registrado.');
    } catch(e) { setMessage(e instanceof Error ? e.message : 'Falha no aceite.'); } finally { setBusy(false); }
  }
  return <section className="panel"><h2>Contrato de afiliação</h2>{doc && <><details><summary>Consultar contrato e comissão · versão {doc.versao}</summary><div className="legal-text">{doc.texto}</div></details>{doc.aceitoEm ? <p>Aceito em {new Date(doc.aceitoEm).toLocaleString('pt-BR')}.</p> : <><label className="check-line"><input type="checkbox" checked={checked} onChange={e => setChecked(e.target.checked)} />Li e aceito o contrato e as condições de comissão.</label><button className="button button-primary" disabled={!checked || !doc.aprovado || busy} onClick={() => void accept()}>Aceitar contrato</button>{!doc.aprovado && <p>O operador precisa concluir a revisão e a configuração dos documentos.</p>}</>}</>}{message && <p role="status">{message}</p>}</section>;
}
