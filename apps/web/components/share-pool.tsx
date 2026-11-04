'use client';
import { useEffect, useState } from 'react';
import { authenticatedFetch } from '../lib/client-api';

type Props = { poolId: string; title: string; detail: string; price: string };

/**
 * Compartilhar o bolão. Afiliado aprovado leva o link com o próprio código (vendas aparecem no painel dele);
 * qualquer outra pessoa compartilha o link simples do bolão.
 */
export function SharePool({ poolId, title, detail, price }: Props) {
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let off = false;
    void authenticatedFetch('/api/v1/afiliados/me/dashboard').then(async (response) => {
      if (!response.ok) return;
      const data = await response.json().catch(() => null) as { codigoAfiliado?: string; statusAprovacao?: string } | null;
      if (!off && data?.codigoAfiliado && data.statusAprovacao === 'aprovado') setCode(data.codigoAfiliado);
    }).catch(() => undefined);
    return () => { off = true; };
  }, []);

  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const link = code ? `${origin}/r/${encodeURIComponent(code)}?bolao=${encodeURIComponent(poolId)}` : `${origin}/boloes/${poolId}`;
  const text = `${title} — ${detail}. Cota de ${price}. Participe pelo Bolão Livre:`;

  async function copy() {
    try { await navigator.clipboard.writeText(link); setCopied(true); window.setTimeout(() => setCopied(false), 2400); } catch { setOpen(true); }
  }
  async function share() {
    if (typeof navigator !== 'undefined' && typeof navigator.share === 'function') {
      try { await navigator.share({ title, text, url: link }); return; } catch (error) { if ((error as { name?: string }).name === 'AbortError') return; }
    }
    setOpen((value) => !value);
  }

  return <div className="share-pool">
    <button type="button" className="button button-secondary share-pool-button" onClick={() => void share()} aria-expanded={open}><span aria-hidden="true">↗</span> Compartilhar este bolão</button>
    {open && <div className="share-pool-panel" role="group" aria-label="Compartilhar">
      <a className="button button-secondary" href={`https://wa.me/?text=${encodeURIComponent(`${text} ${link}`)}`} target="_blank" rel="noreferrer">WhatsApp</a>
      <button type="button" className="button button-secondary" onClick={() => void copy()}>{copied ? 'Link copiado!' : 'Copiar link'}</button>
    </div>}
    <small className="muted share-pool-note">{code
      ? <>Este link leva o seu código de afiliado (<strong>{code}</strong>). As cotas vendidas por ele aparecem no seu painel.</>
      : 'Link simples do bolão. Para ter um link com o seu código e acompanhar as cotas vendidas, seja afiliado.'}</small>
  </div>;
}
