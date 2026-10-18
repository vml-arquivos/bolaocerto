'use client';
import Link from 'next/link';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { shortDate } from '../lib/domain';
import { authenticatedFetch } from '../lib/client-api';

type Notice = { id: string; titulo: string; mensagem: string; link: string | null; lida: boolean; criadoEm: string };

function messageOf(data: { message?: string | string[] }, fallback: string) {
  return Array.isArray(data.message) ? data.message.join(' ') : data.message || fallback;
}

export function NotificationsCard() {
  const [items, setItems] = useState<Notice[] | null>(null);
  const [unread, setUnread] = useState(0);
  const load = useCallback(async () => {
    try {
      const response = await authenticatedFetch('/api/v1/notificacoes');
      if (!response.ok) { setItems([]); return; }
      const data = await response.json() as { items: Notice[]; naoLidas: number };
      setItems(data.items); setUnread(data.naoLidas);
    } catch { setItems([]); }
  }, []);
  useEffect(() => { void load(); }, [load]);
  async function readOne(id: string) {
    await authenticatedFetch(`/api/v1/notificacoes/${id}/lida`, { method: 'POST' }).catch(() => undefined);
    void load();
  }
  async function readAll() {
    await authenticatedFetch('/api/v1/notificacoes/lidas', { method: 'POST' }).catch(() => undefined);
    void load();
  }
  if (!items || items.length === 0) return null;
  return <article className="dashboard-card wide notices-card" aria-labelledby="avisos-titulo">
    <div className="card-heading"><h2 id="avisos-titulo">Avisos{unread > 0 && <span className="badge-count" aria-label={`${unread} não lidos`}>{unread}</span>}</h2>{unread > 0 && <button type="button" className="text-link" onClick={() => void readAll()}>Marcar todos como lidos</button>}</div>
    <ul className="notice-list">{items.slice(0, 8).map((item) => <li key={item.id} className={item.lida ? 'is-read' : 'is-unread'}>
      <div><strong>{item.titulo}</strong><p>{item.mensagem}</p><small className="muted">{shortDate(item.criadoEm)}</small></div>
      <div className="notice-actions">{item.link && <Link className="text-link" href={item.link} onClick={() => !item.lida && void readOne(item.id)}>Abrir</Link>}{!item.lida && <button type="button" className="text-link" onClick={() => void readOne(item.id)}>Marcar como lido</button>}</div>
    </li>)}</ul>
  </article>;
}

export function PasswordCard() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setMessage(''); setOk(false);
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const novaSenha = String(form.get('novaSenha') ?? '');
    if (novaSenha !== String(form.get('confirmacao') ?? '')) { setMessage('As duas senhas novas precisam ser iguais.'); return; }
    setBusy(true);
    try {
      const response = await authenticatedFetch('/api/v1/usuarios/me/senha', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ senhaAtual: String(form.get('senhaAtual') ?? ''), novaSenha }) });
      const data = await response.json().catch(() => ({})) as { message?: string | string[] };
      if (!response.ok) throw new Error(messageOf(data, 'Não foi possível alterar a senha.'));
      formElement.reset(); setOk(true); setMessage('Senha alterada com sucesso.');
    } catch (issue) { setMessage(issue instanceof Error ? issue.message : 'Erro inesperado.'); } finally { setBusy(false); }
  }
  return <article className="dashboard-card wide"><h2>Segurança</h2>
    <p className="muted">Troque a senha com regularidade e não a repita em outros serviços.</p>
    <form onSubmit={submit} className="admin-form-grid">
      <div className="field"><label htmlFor="senhaAtual">Senha atual</label><input id="senhaAtual" name="senhaAtual" type="password" required autoComplete="current-password" /></div>
      <div className="field"><label htmlFor="novaSenhaConta">Nova senha (mín. 12)</label><input id="novaSenhaConta" name="novaSenha" type="password" minLength={12} maxLength={128} required autoComplete="new-password" /></div>
      <div className="field"><label htmlFor="confirmacaoConta">Repita a nova senha</label><input id="confirmacaoConta" name="confirmacao" type="password" minLength={12} maxLength={128} required autoComplete="new-password" /></div>
      <div className="field" style={{ alignSelf: 'end' }}><button className="button button-primary" disabled={busy}>{busy ? 'Salvando…' : 'Alterar senha'}</button></div>
    </form>
    {message && <div className={`form-message ${ok ? 'form-success' : 'form-error'}`} role={ok ? 'status' : 'alert'}>{message}</div>}
  </article>;
}

export function PrivacyCard() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');
  const [ok, setOk] = useState(false);
  const [askDelete, setAskDelete] = useState(false);

  async function download() {
    setBusy(true); setMessage(''); setOk(false);
    try {
      const response = await authenticatedFetch('/api/v1/usuarios/me/dados');
      if (!response.ok) throw new Error('Não foi possível gerar o arquivo agora.');
      const blob = new Blob([JSON.stringify(await response.json(), null, 2)], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a'); link.href = url; link.download = 'meus-dados-bl.json'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 2000);
      setOk(true); setMessage('Arquivo baixado.');
    } catch (issue) { setMessage(issue instanceof Error ? issue.message : 'Erro inesperado.'); } finally { setBusy(false); }
  }
  async function requestDeletion(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setBusy(true); setMessage(''); setOk(false);
    const motivo = String(new FormData(event.currentTarget).get('motivo') ?? '').trim();
    try {
      const response = await authenticatedFetch('/api/v1/usuarios/me/exclusao', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(motivo ? { motivo } : {}) });
      const data = await response.json().catch(() => ({})) as { message?: string | string[]; mensagem?: string };
      if (!response.ok) throw new Error(messageOf(data, 'Não foi possível registrar o pedido.'));
      setOk(true); setAskDelete(false); setMessage(data.mensagem || 'Pedido registrado.');
    } catch (issue) { setMessage(issue instanceof Error ? issue.message : 'Erro inesperado.'); } finally { setBusy(false); }
  }
  return <article className="dashboard-card wide"><h2>Privacidade e dados (LGPD)</h2>
    <p className="muted">Você pode baixar uma cópia dos seus dados ou pedir a exclusão da conta. Dados fiscais e de pagamento são mantidos pelo prazo exigido em lei. Veja a <Link className="text-link" href="/privacidade">política de privacidade</Link>.</p>
    <div className="action-row">
      <button type="button" className="button button-ghost" onClick={() => void download()} disabled={busy}>Baixar meus dados</button>
      {!askDelete && <button type="button" className="button button-ghost" onClick={() => setAskDelete(true)} disabled={busy}>Solicitar exclusão da conta</button>}
    </div>
    {askDelete && <form onSubmit={requestDeletion} className="delete-form">
      <div className="field"><label htmlFor="motivo">Quer contar o motivo? (opcional)</label><textarea id="motivo" name="motivo" maxLength={500} rows={3} /></div>
      <p className="muted">Cotas em andamento são mantidas até a apuração do concurso. Nossa equipe analisa o pedido e entra em contato.</p>
      <div className="action-row"><button className="button button-primary" disabled={busy}>{busy ? 'Enviando…' : 'Confirmar pedido de exclusão'}</button><button type="button" className="button button-ghost" onClick={() => setAskDelete(false)}>Cancelar</button></div>
    </form>}
    {message && <div className={`form-message ${ok ? 'form-success' : 'form-error'}`} role={ok ? 'status' : 'alert'}>{message}</div>}
  </article>;
}
