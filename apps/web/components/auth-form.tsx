'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { PasswordField } from './password-field';
import { rememberLogin } from './header-auth';
import { passwordProblem } from '../lib/password';

import { isStaff, landingFor } from '../lib/roles';
export type InviteView = { codigo: string; tipo: 'afiliado' | 'cliente' | 'indicacao'; convidadoPor: string | null; email: string | null; grupo: string | null };

export function AuthForm({ mode, audience = 'cliente', invite }: { mode: 'login' | 'register'; audience?: 'cliente' | 'admin'; invite?: InviteView | null }) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [needs2fa, setNeeds2fa] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage('');
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    if (mode === 'register') { const problem = passwordProblem(String(payload.senha ?? '')); if (problem) { setMessage(problem); setLoading(false); return; } }
    try {
      const response = await fetch(`/api/v1/auth/${mode === 'login' ? 'login' : 'registrar'}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({})) as { message?: string | string[]; requer2fa?: boolean };
      if (result.requer2fa) setNeeds2fa(true);
      if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(' ') : result.message || 'Não foi possível concluir.');
      const authenticatedUser = (result as { user?: { papel?: string } }).user;
      rememberLogin();
      if (audience === 'admin') {
        if (isStaff(authenticatedUser?.papel)) { window.location.href = landingFor(authenticatedUser?.papel, new URLSearchParams(window.location.search).get('next')); return; }
        await fetch('/api/v1/auth/logout', { method: 'POST', credentials: 'include' }).catch(() => undefined);
        throw new Error(authenticatedUser?.papel === 'afiliado' ? 'Esta conta é de afiliado e não entra no painel da equipe. Entre pelo aplicativo Bolão Livre: o login leva você direto para a sua área de afiliado.' : 'Esta conta é de cliente e não entra no painel da equipe. Para comprar cotas, use o aplicativo Bolão Livre.');
      }
      // Cada papel vai direto para a sua área: cliente → aplicativo, afiliado → área do afiliado, equipe/admin → painel.
      window.location.href = landingFor(authenticatedUser?.papel, mode === 'login' ? new URLSearchParams(window.location.search).get('next') : null);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro inesperado.'); } finally { setLoading(false); }
  }
  const asAffiliate = mode === 'register' && invite?.tipo === 'afiliado';
  return <form onSubmit={submit}>
    {mode === 'register' && invite && <div className="notice invite-banner" role="status"><strong>{asAffiliate ? 'Você foi convidado para ser afiliado' : invite.convidadoPor ? `${invite.convidadoPor} convidou você` : 'Você recebeu um convite'}</strong><span>{asAffiliate ? 'Complete seu cadastro. Ao terminar, você já entra na sua área de afiliado, com seu grupo e seu link de vendas.' : invite.grupo ? `Ao criar a conta, você entra automaticamente no grupo ${invite.grupo}.` : 'Ao criar a conta, você passa a fazer parte do grupo de quem indicou.'}</span></div>}
    {mode === 'register' && invite && <input type="hidden" name="codigoAfiliado" value={invite.codigo} />}
    {mode === 'register' && <><div className="field"><label htmlFor="nome">Nome completo</label><input id="nome" name="nome" minLength={2} required autoComplete="name" /></div><div className="form-row"><div className="field"><label htmlFor="cpf">CPF (somente números)</label><input id="cpf" name="cpf" inputMode="numeric" pattern="[0-9]{11}" maxLength={11} required /></div><div className="field"><label htmlFor="dataNascimento">Data de nascimento</label><input id="dataNascimento" name="dataNascimento" type="date" required /></div></div><div className="field"><label htmlFor="telefone">Telefone</label><input id="telefone" name="telefone" type="tel" autoComplete="tel" /></div></>}
    <div className="field"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" required autoComplete="email" {...(mode === 'register' && invite?.email ? { defaultValue: invite.email, readOnly: true } : {})} /></div>{asAffiliate && <div className="field"><label htmlFor="chavePixRepasse">Chave Pix para receber comissões</label><input id="chavePixRepasse" name="chavePixRepasse" minLength={5} maxLength={140} placeholder="CPF, e-mail, telefone ou chave aleatória" /><small className="field-hint">Pode preencher depois, mas é por ela que as comissões são pagas.</small></div>}<PasswordField id="senha" name="senha" label="Senha" create={mode === 'register'}>{mode === 'login' && <small className="field-hint"><Link href="/esqueci-senha">Esqueci minha senha</Link></small>}</PasswordField>
    {mode === 'login' && needs2fa && <div className="field"><label htmlFor="codigo">Código do aplicativo autenticador</label><input id="codigo" name="codigo" inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={20} required autoFocus /><small className="field-hint">Perdeu o celular? Use um código de recuperação (formato XXXXX-XXXXX).</small></div>}
    {message && <div className="form-message form-error" role="alert">{message}</div>}<button className="button button-primary" disabled={loading}>{loading ? 'Aguarde…' : audience === 'admin' ? 'Entrar no painel' : mode === 'login' ? 'Entrar no BL' : asAffiliate ? 'Completar meu cadastro' : 'Criar minha conta'}</button>
    {audience !== 'admin' && <p className="form-foot">{mode === 'login' ? <>Ainda não tem conta? <Link href="/cadastro">Cadastre-se</Link></> : <>Já possui conta? <Link href="/login">Entrar</Link></>}</p>}
  </form>;
}
