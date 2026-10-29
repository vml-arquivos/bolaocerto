'use client';
import Link from 'next/link';
import { FormEvent, useState } from 'react';

function errorText(result: { message?: string | string[] }, fallback: string) {
  return Array.isArray(result.message) ? result.message.join(' ') : result.message || fallback;
}

export function ForgotPasswordForm() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState('');
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setLoading(true); setError('');
    const email = String(new FormData(event.currentTarget).get('email') ?? '').trim();
    try {
      const response = await fetch('/api/v1/auth/esqueci-senha', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ email }) });
      const result = await response.json().catch(() => ({})) as { message?: string | string[]; mensagem?: string };
      if (!response.ok) throw new Error(errorText(result, 'Não foi possível concluir agora.'));
      setDone(result.mensagem || 'Se o e-mail estiver cadastrado, enviaremos o link de redefinição.');
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Erro inesperado.'); } finally { setLoading(false); }
  }
  if (done) return <div><div className="form-message form-success" role="status">{done}</div><p className="form-foot">Não recebeu? Confira a caixa de spam ou peça o link ao atendimento. <Link href="/login">Voltar para o login</Link></p></div>;
  return <form onSubmit={submit}>
    <div className="field"><label htmlFor="email">E-mail da conta</label><input id="email" name="email" type="email" required autoComplete="email" /></div>
    {error && <div className="form-message form-error" role="alert">{error}</div>}
    <button className="button button-primary" disabled={loading}>{loading ? 'Enviando…' : 'Enviar link de redefinição'}</button>
    <p className="form-foot"><Link href="/login">Voltar para o login</Link></p>
  </form>;
}

export function ResetPasswordForm({ token }: { token: string }) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);
  if (!token) return <div><div className="form-message form-error" role="alert">Link incompleto. Abra novamente o link que enviamos por e-mail ou peça um novo.</div><p className="form-foot"><Link href="/esqueci-senha">Pedir novo link</Link></p></div>;
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError('');
    const form = new FormData(event.currentTarget);
    const novaSenha = String(form.get('novaSenha') ?? '');
    if (novaSenha !== String(form.get('confirmacao') ?? '')) { setError('As duas senhas precisam ser iguais.'); return; }
    setLoading(true);
    try {
      const response = await fetch('/api/v1/auth/redefinir-senha', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ token, novaSenha }) });
      const result = await response.json().catch(() => ({})) as { message?: string | string[] };
      if (!response.ok) throw new Error(errorText(result, 'Link inválido ou expirado.'));
      setDone(true);
    } catch (issue) { setError(issue instanceof Error ? issue.message : 'Erro inesperado.'); } finally { setLoading(false); }
  }
  if (done) return <div><div className="form-message form-success" role="status">Senha alterada com sucesso. Já pode entrar com a nova senha.</div><Link className="button button-primary" href="/login">Ir para o login</Link></div>;
  return <form onSubmit={submit}>
    <div className="field"><label htmlFor="novaSenha">Nova senha (6 a 8 números)</label><input id="novaSenha" name="novaSenha" type="password" minLength={6} maxLength={8} pattern="[0-9]{6,8}" inputMode="numeric" required autoComplete="new-password" /></div>
    <div className="field"><label htmlFor="confirmacao">Repita a nova senha</label><input id="confirmacao" name="confirmacao" type="password" minLength={6} maxLength={8} pattern="[0-9]{6,8}" inputMode="numeric" required autoComplete="new-password" /></div>
    {error && <div className="form-message form-error" role="alert">{error}</div>}
    <button className="button button-primary" disabled={loading}>{loading ? 'Salvando…' : 'Salvar nova senha'}</button>
  </form>;
}
