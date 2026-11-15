'use client';
import { useEffect, useState } from 'react';

type Links = { comunidade: string; grupo: string; instagram: string };
type GroupLink = { grupoId: string; nome: string; link: string };
type AffiliateLinks = { nome: string; grupo: string; comunidade: string; instagram: string };

/**
 * Botões para entrar na comunidade e no grupo do WhatsApp e seguir o BL no Instagram. Com `groups`, mostra também o
 * WhatsApp dos grupos de quem está logado (ex.: o grupo do afiliado que trouxe a pessoa). Nada aparece sem link configurado.
 */
export function WhatsappJoin({ className = '', groups = false, title, shareId }: { className?: string; groups?: boolean; title?: string; shareId?: string }) {
  const [links, setLinks] = useState<Links | null>(null);
  const [mine, setMine] = useState<GroupLink[]>([]);
  const [affiliate, setAffiliate] = useState<AffiliateLinks | null>(null);
  useEffect(() => {
    let alive = true;
    void fetch('/api/v1/config/comunidade', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (alive && data) setLinks({ comunidade: String(data.comunidade ?? ''), grupo: String(data.grupo ?? ''), instagram: String(data.instagram ?? '') }); })
      .catch(() => undefined);
    if (groups) void fetch(`/api/v1/usuarios/me/comunidade${shareId ? `?cota=${encodeURIComponent(shareId)}` : ''}`, { cache: 'no-store', credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (!alive) return; if (Array.isArray(data?.grupos)) setMine(data.grupos.filter((item: GroupLink) => item.link)); if (data?.afiliado) setAffiliate(data.afiliado); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, [groups, shareId]);
  // Quem veio por um afiliado entra no WhatsApp dele (grupo e comunidade); sem afiliado, nos do Bolão Livre.
  const affiliateWhatsapp = Boolean(affiliate && (affiliate.grupo || affiliate.comunidade));
  const blComunidade = affiliateWhatsapp ? '' : links?.comunidade ?? '';
  const blGrupo = affiliateWhatsapp ? '' : links?.grupo ?? '';
  const hasGlobal = Boolean(blComunidade || blGrupo || links?.instagram);
  const hasAffiliate = Boolean(affiliate && (affiliate.grupo || affiliate.comunidade || affiliate.instagram));
  if (!hasGlobal && !mine.length && !hasAffiliate) return null;
  let primaryUsed = false;
  const kind = () => { const value = primaryUsed ? 'button-secondary' : 'button-primary'; primaryUsed = true; return value; };
  return <div className={`whatsapp-join ${title ? 'has-title' : ''} ${className}`.trim()}>
    {title && <strong className="whatsapp-join-title">{title}</strong>}
    {affiliate?.grupo && !mine.some((item) => item.link === affiliate.grupo) && <a className={`button ${kind()}`} href={affiliate.grupo} target="_blank" rel="noopener noreferrer" data-testid="afiliado-grupo">Entrar no grupo do WhatsApp de {affiliate.nome}</a>}
    {affiliate?.comunidade && <a className={`button ${kind()}`} href={affiliate.comunidade} target="_blank" rel="noopener noreferrer" data-testid="afiliado-comunidade">Entrar na comunidade de {affiliate.nome}</a>}
    {affiliate?.instagram && <a className="button button-secondary" href={affiliate.instagram} target="_blank" rel="noopener noreferrer" data-testid="afiliado-instagram">Seguir {affiliate.nome} no Instagram</a>}
    {mine.map((item) => <a key={item.grupoId} className={`button ${kind()}`} href={item.link} target="_blank" rel="noopener noreferrer" data-testid="whatsapp-meu-grupo">Entrar no WhatsApp do grupo {item.nome}</a>)}
    {blComunidade && <a className={`button ${kind()}`} href={blComunidade} target="_blank" rel="noopener noreferrer" data-testid="whatsapp-comunidade">Entrar na comunidade do WhatsApp</a>}
    {blGrupo && <a className={`button ${kind()}`} href={blGrupo} target="_blank" rel="noopener noreferrer" data-testid="whatsapp-grupo">Entrar no grupo do WhatsApp</a>}
    {links?.instagram && <a className="button button-secondary" href={links.instagram} target="_blank" rel="noopener noreferrer" data-testid="instagram">Seguir o Bolão Livre no Instagram</a>}
  </div>;
}

/** Campos do painel: o administrador cola aqui os convites da comunidade e do grupo. */
export function CommunitySettings({ notify }: { notify: (type: 'success' | 'error', text: string) => void }) {
  const [comunidade, setComunidade] = useState('');
  const [grupo, setGrupo] = useState('');
  const [instagram, setInstagram] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void fetch('/api/v1/config/comunidade', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (data) { setComunidade(String(data.comunidade ?? '')); setGrupo(String(data.grupo ?? '')); setInstagram(String(data.instagram ?? '')); } })
      .catch(() => undefined);
  }, []);
  async function save() {
    setBusy(true);
    try {
      const response = await fetch('/api/v1/admin/comunidade', { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comunidade: comunidade.trim(), grupo: grupo.trim(), instagram: instagram.trim() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'Não foi possível salvar.');
      setComunidade(data.comunidade ?? ''); setGrupo(data.grupo ?? ''); setInstagram(data.instagram ?? '');
      notify('success', 'Links salvos.');
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível salvar.'); }
    finally { setBusy(false); }
  }
  return <>
    <div className="admin-form-grid" style={{ gridTemplateColumns: '1fr' }}>
      <label className="admin-field"><span>Link da comunidade do WhatsApp</span><input type="url" inputMode="url" placeholder="https://chat.whatsapp.com/..." value={comunidade} onChange={(event) => setComunidade(event.target.value)} /></label>
      <label className="admin-field"><span>Link do grupo do WhatsApp</span><input type="url" inputMode="url" placeholder="https://chat.whatsapp.com/..." value={grupo} onChange={(event) => setGrupo(event.target.value)} /></label>
      <label className="admin-field"><span>Instagram do Bolão Livre</span><input type="url" inputMode="url" placeholder="https://www.instagram.com/..." value={instagram} onChange={(event) => setInstagram(event.target.value)} /></label>
    </div>
    <button className="admin-button admin-button-primary" disabled={busy} onClick={() => void save()}>{busy ? 'Salvando…' : 'Salvar links'}</button>
  </>;
}

/** No grupo do afiliado (ou da equipe): link do grupo do WhatsApp que aparece para quem é do grupo. */
export function GroupWhatsappField({ groupId }: { groupId: string }) {
  const [link, setLink] = useState('');
  const [saved, setSaved] = useState('');
  const [state, setState] = useState<{ busy: boolean; text: string; ok: boolean }>({ busy: false, text: '', ok: true });
  useEffect(() => {
    void fetch(`/api/v1/grupos/${groupId}/whatsapp`, { cache: 'no-store', credentials: 'include' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => { if (data) { setLink(String(data.link ?? '')); setSaved(String(data.link ?? '')); } })
      .catch(() => undefined);
  }, [groupId]);
  async function save() {
    setState({ busy: true, text: '', ok: true });
    try {
      const response = await fetch(`/api/v1/grupos/${groupId}/whatsapp`, { method: 'PUT', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ link: link.trim() }) });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'Não foi possível salvar.');
      setLink(data.link ?? ''); setSaved(data.link ?? '');
      setState({ busy: false, ok: true, text: data.link ? 'Link salvo. Quem é do grupo vê o botão para entrar.' : 'Link removido.' });
    } catch (error) { setState({ busy: false, ok: false, text: error instanceof Error ? error.message : 'Não foi possível salvar.' }); }
  }
  return <div className="group-whatsapp">
    <label>Link do grupo do WhatsApp<input type="url" inputMode="url" placeholder="https://chat.whatsapp.com/..." value={link} onChange={(event) => setLink(event.target.value)} /></label>
    <button type="button" className="button button-secondary button-small" disabled={state.busy || link.trim() === saved} onClick={() => void save()}>{state.busy ? 'Salvando…' : 'Salvar link'}</button>
    {state.text && <small className={state.ok ? 'form-success' : 'form-error'} role="status">{state.text}</small>}
  </div>;
}
