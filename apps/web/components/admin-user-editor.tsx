'use client';
import { FormEvent, useEffect, useState } from 'react';
import { authenticatedFetch } from '../lib/client-api';
import { AdminModal } from './admin-attachments';
type User = { id: string; nome: string; email: string; cpf: string; telefone: string | null; dataNascimento: string; papel: string; statusKyc: string; desativadoEm: string | null; criadoEm: string; _count: { cotasCompradas: number; boloesCriados: number } };
async function api(path: string, options?: RequestInit) {
  const response = await authenticatedFetch(path, { ...options, cache: 'no-store' });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(' ') : result.message || 'Não foi possível concluir.');
  return result;
}
export function AdminUserEditor({ id, onClose, onDone }: { id: string; onClose: () => void; onDone: () => Promise<void> }) {
  const [user, setUser] = useState<User | null>(null);
  const [message, setMessage] = useState('');
  const [savedEmail, setSavedEmail] = useState('');
  const [busy, setBusy] = useState(false);
  useEffect(() => { let cancelled = false; void api(`/api/v1/admin/usuarios/${id}`).then(data => { if (!cancelled) { setUser(data); setSavedEmail(data.email); } }).catch(error => { if (!cancelled) setMessage(error.message); }); return () => { cancelled = true; }; }, [id]);
  async function save(event: FormEvent) {
    event.preventDefault(); if (!user || busy) return;
    setBusy(true); setMessage('');
    try {
      await api(`/api/v1/admin/usuarios/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ nome: user.nome, email: user.email, telefone: user.telefone ?? '', dataNascimento: user.dataNascimento.slice(0, 10) }) });
      await onDone(); onClose();
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao salvar.'); } finally { setBusy(false); }
  }
  async function action(type: 'reset' | 'remove' | 'restore') {
    if (!user || busy) return;
    if (type === 'reset' && user.email !== savedEmail) { setMessage('Salve a alteração de e-mail antes de enviar a redefinição.'); return; }
    const prompts = { reset: `Enviar instruções de nova senha para ${user.email}? A senha atual não será exibida nem alterada pelo administrador.`, remove: 'Remover o acesso desta conta? As sessões serão encerradas. Cotas, pagamentos e contratos ficam preservados. Você poderá reativar o acesso.', restore: 'Reativar o acesso desta conta? A pessoa poderá entrar novamente.' };
    if (!window.confirm(prompts[type])) return;
    setBusy(true); setMessage('');
    try {
      const suffix = type === 'reset' ? '/reenviar-senha' : type === 'restore' ? '/reativar' : '';
      const result = await api(`/api/v1/admin/usuarios/${id}${suffix}`, { method: type === 'remove' ? 'DELETE' : 'POST' });
      if (type === 'reset') setMessage(result.mensagem || 'Solicitação enviada.');
      else { await onDone(); onClose(); }
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha na operação.'); } finally { setBusy(false); }
  }
  return <AdminModal title="Consultar e editar conta" onClose={() => { if (!busy) onClose(); }}>
    {!user && !message && <p>Carregando cadastro…</p>}
    {user && <><p><strong>{user.papel}</strong> · {user.desativadoEm ? 'Acesso removido' : 'Conta ativa'} · {user._count.cotasCompradas} participações · {user._count.boloesCriados} bolões criados</p>
      <form className="admin-form-grid" onSubmit={save}>
        <label className="admin-field"><span>Nome</span><input required minLength={2} maxLength={150} value={user.nome} onChange={e => setUser({ ...user, nome: e.target.value })}/></label>
        <label className="admin-field"><span>E-mail</span><input required type="email" maxLength={180} value={user.email} onChange={e => setUser({ ...user, email: e.target.value })}/></label>
        <label className="admin-field"><span>Telefone</span><input type="tel" maxLength={20} value={user.telefone ?? ''} onChange={e => setUser({ ...user, telefone: e.target.value })}/></label>
        <label className="admin-field"><span>Nascimento</span><input required type="date" value={user.dataNascimento.slice(0, 10)} onChange={e => setUser({ ...user, dataNascimento: e.target.value })}/></label>
        <p className="admin-help">CPF: {user.cpf}. A identificação fiscal e os dados das compras anteriores são preservados. Alterar o e-mail encerra as sessões e invalida links antigos de redefinição.</p>
        <button className="admin-button" disabled={busy}>{busy ? 'Processando…' : 'Salvar alterações'}</button>
      </form>
      <hr/><div className="admin-row-actions"><button className="admin-button admin-button-ghost" disabled={busy || Boolean(user.desativadoEm)} onClick={() => void action('reset')}>Enviar redefinição de senha</button><button className="admin-button admin-button-ghost" disabled={busy} onClick={() => void action(user.desativadoEm ? 'restore' : 'remove')}>{user.desativadoEm ? 'Reativar conta' : 'Remover acesso'}</button></div>
      <p className="admin-help">A remoção desativa o acesso; não apaga a pessoa do histórico financeiro. Solicitações de eliminação de dados exigem análise de retenção.</p>
    </>}
    {message && <p role="status" className="notice">{message}</p>}
  </AdminModal>;
}
