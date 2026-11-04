'use client';

import { useCallback, useEffect, useState, type FormEvent } from 'react';
import { useIsSuperAdmin } from './staff-gate';

type Invite = { id: string; codigo: string; tipo: 'operacao' | 'admin'; status: string; emailDestino?: string | null; expiraEm: string; usadoEm?: string | null; usadoPor?: { nome?: string; email?: string } | null };

const ROLE_LABEL: Record<string, string> = { operacao: 'Equipe de operação', admin: 'Administrador' };
const DAYS = [{ value: 1, label: '1 dia' }, { value: 7, label: '7 dias' }, { value: 30, label: '30 dias' }];
const dateFormat = new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short', timeZone: 'America/Sao_Paulo' });

async function request(path: string, options?: RequestInit) {
  const response = await fetch(path, { ...options, credentials: 'include' });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(payload.message) ? payload.message.join(' ') : payload.message || 'Não foi possível concluir.');
  return payload;
}

function statusOf(invite: Invite) {
  if (invite.status === 'usado') return `Usado${invite.usadoPor?.nome ? ` por ${invite.usadoPor.nome}` : ''}`;
  if (invite.status === 'revogado') return 'Cancelado';
  if (invite.status === 'expirado' || new Date(invite.expiraEm).getTime() <= Date.now()) return 'Expirado';
  return 'Aguardando cadastro';
}

/** Gera um link para a pessoa fazer o próprio cadastro já como equipe de operação ou administrador. */
export function StaffInvitePanel({ onNotice }: { onNotice?: (message: string) => void }) {
  const superAdmin = useIsSuperAdmin();
  const [role, setRole] = useState<'operacao' | 'admin'>('operacao');
  const [email, setEmail] = useState('');
  const [days, setDays] = useState(7);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<{ link: string; expiraEm: string; emailEnviado: boolean; email?: string | null } | null>(null);
  const [copied, setCopied] = useState('');
  const [items, setItems] = useState<Invite[]>([]);

  const load = useCallback(async () => {
    try {
      const [ops, admins] = await Promise.all([request('/api/v1/admin/convites?tipo=operacao&pageSize=30'), request('/api/v1/admin/convites?tipo=admin&pageSize=30')]);
      const all = [...(ops.items ?? []), ...(admins.items ?? [])] as Invite[];
      setItems(all.sort((a, b) => new Date(b.expiraEm).getTime() - new Date(a.expiraEm).getTime()));
    } catch { /* a lista é um complemento: o link gerado continua aparecendo */ }
  }, []);
  useEffect(() => { void load(); }, [load]);

  const linkOf = (code: string) => `${window.location.origin}/r/${code}`;
  async function copy(key: string, link: string) {
    try { await navigator.clipboard.writeText(link); setCopied(key); window.setTimeout(() => setCopied(''), 2200); } catch { setError('Não consegui copiar. Selecione o link e copie manualmente.'); }
  }
  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(''); setCreated(null);
    try {
      const invite = await request('/api/v1/admin/convites', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ tipo: role, emailDestino: email.trim() || undefined, expiraEm: new Date(Date.now() + days * 86_400_000).toISOString() }) });
      setCreated({ link: linkOf(invite.codigo), expiraEm: invite.expiraEm, emailEnviado: Boolean(invite.emailEnviado), email: invite.emailDestino });
      onNotice?.(invite.emailEnviado ? `Link criado e enviado para ${invite.emailDestino}.` : 'Link criado. Copie e envie para a pessoa.');
      setEmail('');
      await load();
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível gerar o link.'); } finally { setBusy(false); }
  }
  async function revoke(invite: Invite) {
    setError('');
    try { await request(`/api/v1/admin/convites/${invite.id}/revogar`, { method: 'POST' }); onNotice?.('Link cancelado. Ele não funciona mais.'); await load(); }
    catch (reason) { setError(reason instanceof Error ? reason.message : 'Não foi possível cancelar.'); }
  }

  return <section className="admin-create-panel staff-invite">
    <div className="admin-create-heading"><div><span className="admin-eyebrow">Cadastro pela própria pessoa</span><strong>Gerar link de cadastro da equipe</strong><small>Você não precisa criar a conta: gere o link, envie, e a pessoa preenche os próprios dados. O link vale uma vez só.</small></div></div>
    <form className="admin-form-grid" onSubmit={submit}>
      <label className="admin-field"><span>Perfil de acesso</span><select value={role} onChange={(event) => setRole(event.target.value as 'operacao' | 'admin')}><option value="operacao">Equipe de operação</option>{superAdmin && <option value="admin">Administrador do sistema</option>}</select></label>
      <label className="admin-field"><span>E-mail da pessoa{role === 'admin' ? '' : ' (opcional)'}</span><input type="email" required={role === 'admin'} value={email} onChange={(event) => setEmail(event.target.value)} placeholder="pessoa@exemplo.com" /><small>{role === 'admin' ? 'Obrigatório: o link de administrador só funciona para este e-mail.' : 'Se informar, o link só funciona para este e-mail e ele já sai por e-mail (quando a conexão de e-mail estiver ligada).'}</small></label>
      <label className="admin-field"><span>Validade do link</span><select value={days} onChange={(event) => setDays(Number(event.target.value))}>{DAYS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}</select></label>
      <div className="admin-form-submit"><button className="admin-button admin-button-secondary" disabled={busy}>{busy ? 'Gerando…' : 'Gerar link'}</button></div>
    </form>
    {error && <div className="form-message form-error" role="alert">{error}</div>}
    {created && <div className="admin-generated-link"><div><span>Link gerado · vale até {dateFormat.format(new Date(created.expiraEm))}{created.emailEnviado ? ` · enviado para ${created.email}` : ''}</span><strong>{created.link}</strong></div>
      <button type="button" className="admin-button admin-button-primary" onClick={() => void copy('novo', created.link)}>{copied === 'novo' ? 'Copiado!' : 'Copiar link'}</button>
      <a className="admin-button admin-button-secondary" href={`https://wa.me/?text=${encodeURIComponent(`Faça o seu cadastro na equipe do Bolão Livre: ${created.link}`)}`} target="_blank" rel="noreferrer">WhatsApp</a></div>}
    {items.length > 0 && <div className="staff-invite-list"><h3>Links da equipe</h3>
      <ul>{items.map((invite) => { const waiting = statusOf(invite) === 'Aguardando cadastro'; return <li key={invite.id}>
        <div><strong>{ROLE_LABEL[invite.tipo]}</strong><small>{invite.emailDestino ?? 'Qualquer e-mail'} · {statusOf(invite)} · até {dateFormat.format(new Date(invite.expiraEm))}</small></div>
        {waiting && <div className="staff-invite-actions"><button type="button" className="admin-button admin-button-small" onClick={() => void copy(invite.id, linkOf(invite.codigo))}>{copied === invite.id ? 'Copiado!' : 'Copiar link'}</button><button type="button" className="admin-button admin-button-small admin-button-ghost" onClick={() => void revoke(invite)}>Cancelar</button></div>}
      </li>; })}</ul></div>}
  </section>;
}
