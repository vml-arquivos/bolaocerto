'use client';

import { useState } from 'react';
import { money } from '../lib/domain';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Receipt = Record<string, any>;

async function authenticatedFetch(path: string) {
  let response = await fetch(path, { credentials: 'include' });
  if (response.status === 401) {
    const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (refresh.ok) response = await fetch(path, { credentials: 'include' });
  }
  return response;
}

const dt = (value: unknown) => (value ? new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' }).format(new Date(String(value))) : '—');

/** Recibo do participante: mostra para onde vai cada real pago e baixa o PDF oficial. */
export function ReceiptPanel({ shareId }: { shareId: string }) {
  const [open, setOpen] = useState(false);
  const [receipt, setReceipt] = useState<Receipt | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function toggle() {
    const next = !open; setOpen(next);
    if (!next || receipt) return;
    setBusy(true); setError('');
    try {
      const response = await authenticatedFetch(`/api/v1/cotas/${shareId}/recibo`);
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error((Array.isArray(data.message) ? data.message.join(' ') : data.message) || 'Não foi possível abrir o recibo.');
      setReceipt(data);
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Erro inesperado.'); } finally { setBusy(false); }
  }

  async function download() {
    setBusy(true); setError('');
    try {
      const response = await authenticatedFetch(`/api/v1/cotas/${shareId}/recibo?formato=pdf`);
      if (!response.ok) { const data = await response.json().catch(() => ({})); throw new Error(data.message || 'Não foi possível gerar o PDF.'); }
      const name = /filename="([^"]+)"/.exec(response.headers.get('content-disposition') ?? '')?.[1] ?? 'recibo.pdf';
      const url = URL.createObjectURL(await response.blob());
      const anchor = document.createElement('a'); anchor.href = url; anchor.download = name; document.body.appendChild(anchor); anchor.click(); anchor.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 5000);
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Erro inesperado.'); } finally { setBusy(false); }
  }

  const v = receipt?.valores;
  return <div>
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
      <button type="button" className="button button-secondary" onClick={() => void toggle()} aria-expanded={open}>{open ? 'Ocultar recibo' : 'Ver recibo e como seu valor foi dividido'}</button>
      <button type="button" className="button button-secondary" disabled={busy} onClick={() => void download()}>{busy ? 'Gerando…' : 'Baixar recibo (PDF)'}</button>
    </div>
    {error && <div className="form-message form-error" style={{ marginTop: 8 }}>{error}</div>}
    {open && receipt && v && <div className="receipt-box">
      <div className="receipt-head"><div><span className="overline">Recibo {receipt.numero}</span><strong>{receipt.bolao.modalidade} · concurso {receipt.bolao.concurso}</strong><small>Pago em {dt(receipt.pagamento.confirmadoEm)} · {receipt.pagamento.metodoNome}</small></div><div className="receipt-total"><small>Total pago</small><strong>{money(v.valorPago)}</strong></div></div>
      <div className="receipt-bar" aria-hidden="true"><i style={{ width: `${v.percentuais.apostas}%`, background: 'var(--primary)' }} /><i style={{ width: `${v.percentuais.afiliado}%`, background: 'var(--warning, #d9a400)' }} /><i style={{ width: `${v.percentuais.plataforma}%`, background: 'var(--success, #1a9d5a)' }} /></div>
      <table className="receipt-table"><tbody>
        <tr><td><span className="receipt-dot" style={{ background: 'var(--primary)' }} />Aplicado nas apostas<small>compra dos jogos do bolão na CAIXA</small></td><td>{v.percentuais.apostas}%</td><td>{money(v.aplicadoNasApostas)}</td></tr>
        <tr><td><span className="receipt-dot" style={{ background: 'var(--success, #1a9d5a)' }} />Fica com a plataforma<small>taxa de administração ({v.taxaAdministracaoPct}% sobre as apostas) menos a comissão de indicação</small></td><td>{v.percentuais.plataforma}%</td><td>{money(v.fiqueiPlataforma)}</td></tr>
        <tr><td><span className="receipt-dot" style={{ background: 'var(--warning, #d9a400)' }} />Comissão de indicação{v.afiliadoCodigo ? ` (${v.afiliadoCodigo})` : ''}<small>{v.comissaoAfiliado > 0 ? 'sai da taxa de administração; não aumenta o seu custo' : 'sem afiliado nesta participação'}</small></td><td>{v.percentuais.afiliado}%</td><td>{money(v.comissaoAfiliado)}</td></tr>
        <tr className="receipt-sum"><td>Taxa de administração total</td><td></td><td>{money(v.taxaAdministracao)}</td></tr>
      </tbody></table>
      <div className="receipt-explain">{receipt.explicacoes.map((item: Receipt) => <p key={item.titulo}><strong>{item.titulo}.</strong> {item.texto}</p>)}</div>
      <small className="muted">Código de verificação: <code>{receipt.codigoVerificacao}</code>{receipt.notaFiscal ? ` · Nota fiscal ${receipt.notaFiscal.numero ? `nº ${receipt.notaFiscal.numero}` : 'em emissão'}` : ''}</small>
    </div>}
  </div>;
}
