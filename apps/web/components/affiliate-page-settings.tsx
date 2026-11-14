'use client';
import { useEffect, useState } from 'react';
import { AffiliateTestimonials } from './testimonials';

type Links = { grupo: string; comunidade: string; instagram: string };

/**
 * Aba "Minha página" do afiliado: os links do grupo e da comunidade do WhatsApp e do Instagram dele. Quem ele trouxe vê
 * esses botões logo depois do cadastro, na conta e no pagamento confirmado. Também mostra os depoimentos sobre ele.
 */
export function AffiliatePageSettings() {
  const [links, setLinks] = useState<Links>({ grupo: '', comunidade: '', instagram: '' });
  const [saved, setSaved] = useState<Links | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  useEffect(() => {
    void fetch('/api/v1/afiliados/me/links', { credentials: 'include', cache: 'no-store' }).then((response) => (response.ok ? response.json() : null)).then((data) => { if (data) { setLinks(data); setSaved(data); } }).catch(() => undefined);
  }, []);
  const changed = !saved || links.grupo !== saved.grupo || links.comunidade !== saved.comunidade || links.instagram !== saved.instagram;
  async function save() {
    setBusy(true); setMessage(null);
    try {
      const response = await fetch('/api/v1/afiliados/me/links', { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ grupo: links.grupo.trim(), comunidade: links.comunidade.trim(), instagram: links.instagram.trim() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'Não foi possível salvar.');
      setLinks(data); setSaved(data);
      setMessage({ ok: true, text: 'Links salvos. Seus clientes veem os botões para entrar e seguir.' });
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : 'Não foi possível salvar.' }); }
    finally { setBusy(false); }
  }
  const field = (key: keyof Links, label: string, placeholder: string, hint: string) => <label>{label}<input type="url" inputMode="url" placeholder={placeholder} value={links[key]} disabled={busy} onChange={(event) => setLinks({ ...links, [key]: event.target.value })} /><small>{hint}</small></label>;
  return <div className="affiliate-workspace-grid">
    <section className="affiliate-table-card">
      <div className="affiliate-card-heading"><div><h2>Minha página</h2><p>Links que aparecem para os clientes que você trouxe: logo depois do cadastro, na conta deles e quando o pagamento confirma. Deixe em branco o que você não tiver.</p></div></div>
      <div className="affiliate-form">
        {field('grupo', 'Link do meu grupo do WhatsApp', 'https://chat.whatsapp.com/...', 'Convite do grupo onde você manda os bolões.')}
        {field('comunidade', 'Link da minha comunidade do WhatsApp', 'https://chat.whatsapp.com/...', 'Se você tiver uma comunidade.')}
        {field('instagram', 'Meu Instagram', 'https://www.instagram.com/seu-perfil', 'Link do seu perfil.')}
        {message && <div className={`form-message ${message.ok ? 'form-success' : 'form-error'}`} role="status">{message.text}</div>}
        <button type="button" className="button button-primary" disabled={busy || !changed} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar links'}</button>
      </div>
    </section>
    <section className="affiliate-table-card">
      <div className="affiliate-card-heading"><div><h2>Depoimentos sobre você</h2><p>O que os seus clientes escreveram, depois da aprovação da equipe do BL.</p></div></div>
      <AffiliateTestimonials />
    </section>
  </div>;
}
