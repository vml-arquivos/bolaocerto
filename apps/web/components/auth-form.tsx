'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';

export function AuthForm({ mode }: { mode: 'login' | 'register' }) {
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setMessage('');
    const form = new FormData(event.currentTarget);
    const payload = Object.fromEntries(form.entries());
    try {
      const response = await fetch(`/api/v1/auth/${mode === 'login' ? 'login' : 'registrar'}`, { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const result = await response.json().catch(() => ({})) as { message?: string | string[] };
      if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(' ') : result.message || 'Não foi possível concluir.');
      const authenticatedUser = (result as { user?: { papel?: string } }).user;
      window.location.href = authenticatedUser?.papel === 'admin' ? '/admin' : authenticatedUser?.papel === 'afiliado' ? '/afiliado' : '/minha-conta';
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro inesperado.'); } finally { setLoading(false); }
  }
  return <form onSubmit={submit}>
    {mode === 'register' && <><div className="field"><label htmlFor="nome">Nome completo</label><input id="nome" name="nome" minLength={2} required autoComplete="name" /></div><div className="form-row"><div className="field"><label htmlFor="cpf">CPF (somente números)</label><input id="cpf" name="cpf" inputMode="numeric" pattern="[0-9]{11}" maxLength={11} required /></div><div className="field"><label htmlFor="dataNascimento">Data de nascimento</label><input id="dataNascimento" name="dataNascimento" type="date" required /></div></div><div className="field"><label htmlFor="telefone">Telefone</label><input id="telefone" name="telefone" type="tel" autoComplete="tel" /></div></>}
    <div className="field"><label htmlFor="email">E-mail</label><input id="email" name="email" type="email" required autoComplete="email" /></div><div className="field"><label htmlFor="senha">Senha {mode === 'register' && '(mínimo 12 caracteres)'}</label><input id="senha" name="senha" type="password" minLength={mode === 'register' ? 12 : 1} required autoComplete={mode === 'login' ? 'current-password' : 'new-password'} /></div>
    {message && <div className="form-message form-error" role="alert">{message}</div>}<button className="button button-primary" disabled={loading}>{loading ? 'Aguarde…' : mode === 'login' ? 'Entrar no BL' : 'Criar minha conta'}</button>
    <p className="form-foot">{mode === 'login' ? <>Ainda não tem conta? <Link href="/cadastro">Cadastre-se</Link></> : <>Já possui conta? <Link href="/login">Entrar</Link></>}</p>
  </form>;
}
