'use client';
import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import { authenticatedFetch } from '../lib/client-api';

type Profile = { nome: string; cpf: string; email: string; telefone: string | null; papel: string; chavePix: string | null; foto: { versao: number } | null };

/** Reduz a foto no próprio aparelho (quadrado de 256 px, JPEG): envio rápido e sem estourar o limite do servidor. */
async function shrink(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const side = Math.min(bitmap.width, bitmap.height);
  const canvas = document.createElement('canvas');
  canvas.width = 256; canvas.height = 256;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Não foi possível preparar a foto neste aparelho.');
  context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 256, 256);
  return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Não foi possível preparar a foto.'))), 'image/jpeg', 0.85));
}

function initials(name: string) { return name.split(/\s+/).filter(Boolean).slice(0, 2).map((part) => part[0]!.toUpperCase()).join('') || 'BL'; }

/** Dados da própria conta: nome, telefone, chave Pix e foto. CPF e e-mail aparecem, mas só mudam pelo suporte. */
export function ProfilePanel({ pixLabel = 'Chave Pix', showPix = true, showPhoto = true, onSaved }: { pixLabel?: string; showPix?: boolean; showPhoto?: boolean; onSaved?: () => void }) {
  const [profile, setProfile] = useState<Profile | null>(null);
  const [form, setForm] = useState({ nome: '', telefone: '', chavePix: '' });
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  const apply = useCallback((data: Profile) => { setProfile(data); setForm({ nome: data.nome, telefone: data.telefone ?? '', chavePix: data.chavePix ?? '' }); }, []);
  useEffect(() => {
    let off = false;
    void authenticatedFetch('/api/v1/usuarios/me/perfil', { cache: 'no-store' }).then(async (response) => (response.ok ? await response.json() as Profile : null)).then((data) => { if (!off && data) apply(data); }).catch(() => undefined);
    return () => { off = true; };
  }, [apply]);

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      const response = await authenticatedFetch('/api/v1/usuarios/me', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nome: form.nome, ...(form.telefone ? { telefone: form.telefone } : {}), ...(showPix ? { chavePix: form.chavePix } : {}) }) });
      const result = await response.json().catch(() => ({})) as Profile & { message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(' ') : result.message || 'Não foi possível salvar.');
      apply(result); setMessage({ ok: true, text: 'Dados salvos.' }); onSaved?.();
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : 'Não foi possível salvar.' }); } finally { setBusy(false); }
  }

  async function upload(file: File | undefined) {
    if (!file) return;
    setBusy(true); setMessage(null);
    try {
      const blob = await shrink(file);
      const body = new FormData(); body.set('arquivo', blob, 'foto.jpg');
      const response = await authenticatedFetch('/api/v1/usuarios/me/foto', { method: 'PUT', body });
      const result = await response.json().catch(() => ({})) as { foto?: { versao: number }; message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(' ') : result.message || 'Não foi possível enviar a foto.');
      setProfile((current) => (current ? { ...current, foto: result.foto ?? null } : current)); setMessage({ ok: true, text: 'Foto atualizada.' });
    } catch (error) { setMessage({ ok: false, text: error instanceof Error ? error.message : 'Não foi possível enviar a foto.' }); } finally { setBusy(false); if (input.current) input.current.value = ''; }
  }

  async function removePhoto() {
    setBusy(true); setMessage(null);
    try { await authenticatedFetch('/api/v1/usuarios/me/foto', { method: 'DELETE' }); setProfile((current) => (current ? { ...current, foto: null } : current)); setMessage({ ok: true, text: 'Foto removida.' }); }
    finally { setBusy(false); }
  }

  if (!profile) return <section className="profile-panel" aria-busy="true"><p className="muted">Carregando seus dados…</p></section>;
  return <section className="profile-panel" aria-label="Meus dados">
    {showPhoto && <div className="profile-photo">
      {profile.foto ? <img src={`/api/v1/usuarios/me/foto?v=${profile.foto.versao}`} alt="Sua foto" width={88} height={88} /> : <span className="profile-initials" aria-hidden="true">{initials(profile.nome)}</span>}
      <div><button type="button" className="button button-secondary" disabled={busy} onClick={() => input.current?.click()}>{profile.foto ? 'Trocar foto' : 'Colocar uma foto'}</button>{profile.foto && <button type="button" className="button button-ghost" disabled={busy} onClick={() => void removePhoto()}>Remover</button>}<input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden onChange={(event) => void upload(event.target.files?.[0])} /><small className="muted">PNG, JPG ou WEBP. A foto é ajustada para ficar leve.</small></div>
    </div>}
    <form className="profile-form" onSubmit={save}>
      <label>Nome completo<input required minLength={2} maxLength={150} value={form.nome} onChange={(event) => setForm({ ...form, nome: event.target.value })} /></label>
      <label>Telefone com DDD<input type="tel" inputMode="tel" value={form.telefone} onChange={(event) => setForm({ ...form, telefone: event.target.value })} placeholder="(11) 91234-5678" /></label>
      {showPix && <label>{pixLabel}<input maxLength={140} value={form.chavePix} onChange={(event) => setForm({ ...form, chavePix: event.target.value })} placeholder="CPF, e-mail, telefone ou chave aleatória" /><small className="muted">É por esta chave que o BL paga prêmios e devolve valores. Confira com cuidado.</small></label>}
      <div className="profile-fixed"><span>CPF</span><strong>{profile.cpf}</strong><span>E-mail de acesso</span><strong>{profile.email}</strong><small className="muted">CPF e e-mail não mudam por aqui. Para trocar, fale com o suporte.</small></div>
      {message && <div className={`form-message ${message.ok ? 'form-success' : 'form-error'}`} role="status">{message.text}</div>}
      <button className="button button-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar dados'}</button>
    </form>
  </section>;
}
