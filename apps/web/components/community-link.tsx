'use client';
import { useEffect, useState } from 'react';

type Links = { comunidade: string; grupo: string };

/** Botões para entrar na comunidade e no grupo do WhatsApp. Não aparece enquanto os links não estiverem configurados no painel. */
export function WhatsappJoin({ className = '' }: { className?: string }) {
  const [links, setLinks] = useState<Links | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch('/api/v1/config/comunidade', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (alive && data) setLinks({ comunidade: String(data.comunidade ?? ''), grupo: String(data.grupo ?? '') }); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  if (!links || (!links.comunidade && !links.grupo)) return null;
  return <div className={`whatsapp-join ${className}`.trim()}>
    {links.comunidade && <a className="button button-primary" href={links.comunidade} target="_blank" rel="noopener noreferrer" data-testid="whatsapp-comunidade">Entrar na comunidade do WhatsApp</a>}
    {links.grupo && <a className={`button ${links.comunidade ? 'button-secondary' : 'button-primary'}`} href={links.grupo} target="_blank" rel="noopener noreferrer" data-testid="whatsapp-grupo">Entrar no grupo do WhatsApp</a>}
  </div>;
}

/** Campos do painel: o administrador cola aqui os convites da comunidade e do grupo. */
export function CommunitySettings({ notify }: { notify: (type: 'success' | 'error', text: string) => void }) {
  const [comunidade, setComunidade] = useState('');
  const [grupo, setGrupo] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch('/api/v1/config/comunidade', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (data) { setComunidade(String(data.comunidade ?? '')); setGrupo(String(data.grupo ?? '')); } })
      .catch(() => undefined);
  }, []);
  async function save() {
    setBusy(true);
    try {
      const response = await fetch('/api/v1/admin/comunidade', { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comunidade: comunidade.trim(), grupo: grupo.trim() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'Não foi possível salvar.');
      setComunidade(data.comunidade ?? ''); setGrupo(data.grupo ?? '');
      notify('success', 'Links do WhatsApp salvos.');
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  return <>
    <div className="admin-form-grid" style={{ gridTemplateColumns: '1fr' }}>
      <label className="admin-field"><span>Link da comunidade do WhatsApp</span><input type="url" inputMode="url" placeholder="https://chat.whatsapp.com/..." value={comunidade} onChange={(event) => setComunidade(event.target.value)} /></label>
      <label className="admin-field"><span>Link do grupo do WhatsApp</span><input type="url" inputMode="url" placeholder="https://chat.whatsapp.com/..." value={grupo} onChange={(event) => setGrupo(event.target.value)} /></label>
    </div>
    <button className="admin-button admin-button-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar links'}</button>
  </>;
}
