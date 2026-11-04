'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';
import { PasswordField } from './password-field';
import { rememberLogin } from './header-auth';
import { passwordProblem } from '../lib/password';

import { isStaff, landingFor } from '../lib/roles';
export type InviteContract = { texto: string; hash: string; versao: string; aprovado: boolean };
export type InviteView = { codigo: string; tipo: 'afiliado' | 'cliente' | 'indicacao' | 'equipe'; papel?: 'operacao' | 'admin' | null; convidadoPor: string | null; email: string | null; grupo: string | null; comissaoPct?: string | null; contrato?: InviteContract | null };

export function AuthForm({ mode, audience = 'cliente', invite }: { mode: 'login' | 'register'; audience?: 'cliente' | 'admin'; invite?: InviteView | null }) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [needs2fa, setNeeds2fa] = useState(false);
  const [contractAccepted, setContractAccepted] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage('');
    const form = new FormData(event.currentTarget);
    const payload: Record<string, unknown> = Object.fromEntries(form.entries());
    // Afiliado: o aceite do contrato (com a comissão definida pelo BL) acontece no próprio cadastro.
    if (mode === 'register' && invite?.tipo === 'afiliado' && invite.contrato?.aprovado) {
      if (!contractAccepted) { setMessage('Leia e aceite o contrato de afiliação para concluir o cadastro.'); setLoading(false); return; }
      payload.aceiteContratoHash = invite.contrato.hash;
    }
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
  const asStaff = mode === 'register' && invite?.tipo === 'equipe';
  return <form onSubmit={submit}>
    {mode === 'register' && invite && <div className="notice invite-banner" role="status"><strong>{asStaff ? `Você foi convidado para ${invite?.papel === 'admin' ? 'a administração' : 'a equipe de operação'}` : asAffiliate ? 'Você foi convidado para ser afiliado' : invite.convidadoPor ? `${invite.convidadoPor} convidou você` : 'Você recebeu um convite'}</strong><span>{asStaff ? `${invite?.convidadoPor ? `${invite.convidadoPor} convidou você. ` : ''}Preencha os seus dados para criar o seu acesso. Ao terminar, você entra direto no painel do BL.${invite?.email ? ' Use o e-mail do convite.' : ''}` : asAffiliate ? `Complete seu cadastro. Ao terminar, você já entra na sua área de afiliado, com seu grupo e seu link de vendas.${invite.comissaoPct ? ` Sua comissão, definida pela equipe do BL: ${Number(invite.comissaoPct).toLocaleString('pt-BR')}% sobre a taxa de administração das vendas.` : ''}` : invite.grupo ? `Ao criar a conta, você entra automaticamente no grupo ${invite.grupo}.` : 'Ao criar a conta, você passa a fazer parte do grupo de quem indicou.'}</span></div>}
    {mode === 'register' && invite && <input type="hidden" name="codigoAfiliado" value={invite.codigo} />}
    {mode === 'register' && <><div className="field"><label htmlFor="nome">Nome completo</label><input id="nome" name="nome" minLength={2} required autoComplete="name" /></div><div className="form-row"><div className="field"><label htmlFor="cpf">CPF (somente números)</label><input id="cpf" name="cpf" inputMode="numeric" pattern="[0-9]{11}" maxLength={11} required /></div><div className="field"><label htmlFor="dataNascimento">Data de nascimento</label><input id="dataNascimento" name="dataNascimento" type="date" required /></div></div><div className="field"><label htmlFor="telefone">Telefone</label><input id="telefone" name="telefone" type="tel" autoComplete="tel" /></div></>}
    <div className="field"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" required autoComplete="email" {...(mode === 'register' && invite?.email ? { defaultValue: invite.email, readOnly: true } : {})} /></div>{asAffiliate && <div className="field"><label htmlFor="chavePixRepasse">Chave Pix para receber comissões</label><input id="chavePixRepasse" name="chavePixRepasse" minLength={5} maxLength={140} placeholder="CPF, e-mail, telefone ou chave aleatória" /><small className="field-hint">Pode preencher depois, mas é por ela que as comissões são pagas.</small></div>}{asAffiliate && invite?.contrato && <div className="field contract-field"><details><summary>Ler o contrato de afiliação{invite.comissaoPct ? ` · comissão de ${Number(invite.comissaoPct).toLocaleString('pt-BR')}%` : ''}</summary><div className="legal-text">{invite.contrato.texto}</div></details>{invite.contrato.aprovado ? <label className="check-line"><input type="checkbox" checked={contractAccepted} onChange={(event) => setContractAccepted(event.target.checked)} />Li e aceito o contrato e a comissão de {invite.comissaoPct ? `${Number(invite.comissaoPct).toLocaleString('pt-BR')}%` : 'afiliado'}.</label> : <small className="field-hint">O contrato ainda está em revisão. Você conclui o cadastro agora e aceita o contrato na sua área de afiliado assim que ele for liberado.</small>}</div>}<PasswordField id="senha" name="senha" label="Senha" create={mode === 'register'}>{mode === 'login' && <small className="field-hint"><Link href="/esqueci-senha">Esqueci minha senha</Link></small>}</PasswordField>
    {mode === 'login' && needs2fa && <div className="field"><label htmlFor="codigo">Código do aplicativo autenticador</label><input id="codigo" name="codigo" inputMode="numeric" autoComplete="one-time-code" minLength={6} maxLength={20} required autoFocus /><small className="field-hint">Perdeu o celular? Use um código de recuperação (formato XXXXX-XXXXX).</small></div>}
    {message && <div className="form-message form-error" role="alert">{message}</div>}<button className="button button-primary" disabled={loading}>{loading ? 'Aguarde…' : audience === 'admin' ? 'Entrar no painel' : mode === 'login' ? 'Entrar no BL' : asAffiliate ? 'Completar meu cadastro' : 'Criar minha conta'}</button>
    {audience !== 'admin' && <p className="form-foot">{mode === 'login' ? <>Ainda não tem conta? <Link href="/cadastro">Cadastre-se</Link></> : <>Já possui conta? <Link href="/login">Entrar</Link></>}</p>}
  </form>;
}
