'use client';
import Link from 'next/link';
import { FormEvent, useEffect, useState } from 'react';
import { rememberLogin } from './header-auth';
import { landingFor } from '../lib/roles';
import { GOOGLE_SIGNUP_KEY } from './google-button';
import { AddressFields, readAddress } from './address-fields';

type Pending = { token: string; nome: string; email: string };

/** Segunda etapa de quem entrou com Google pela primeira vez: CPF, telefone, Pix, endereço e aceites (o mesmo que o cadastro normal). */
export function GoogleSignupForm({ convite = null }: { convite?: string | null }) {
  const [pending, setPending] = useState<Pending | null | undefined>(undefined);
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    try { const raw = sessionStorage.getItem(GOOGLE_SIGNUP_KEY); setPending(raw ? JSON.parse(raw) as Pending : null); } catch { setPending(null); }
  }, []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); if (!pending) return;
    setLoading(true); setMessage('');
    const form = new FormData(event.currentTarget);
    const payload = { token: pending.token, cpf: String(form.get('cpf') ?? ''), telefone: String(form.get('telefone') ?? ''), chavePix: String(form.get('chavePix') ?? '').trim(), maiorDeIdade: form.get('maiorDeIdade') === 'on', aceiteTermos: form.get('aceiteTermos') === 'on', aceitePrivacidade: form.get('aceitePrivacidade') === 'on', endereco: readAddress(event.currentTarget), ...(convite ? { codigoAfiliado: convite } : {}) };
    if (!payload.aceiteTermos || !payload.aceitePrivacidade || !payload.maiorDeIdade) { setMessage('Para criar a conta, aceite os Termos de Uso, a Política de Privacidade (LGPD) e confirme que tem 18 anos ou mais.'); setLoading(false); return; }
    try {
      const response = await fetch('/api/v1/auth/google/cadastro', { method: 'POST', credentials: 'include', headers: { 'content-type': 'application/json' }, body: JSON.stringify(payload) });
      const body = await response.json().catch(() => ({})) as { message?: string | string[]; user?: { papel?: string } };
      if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(' ') : body.message || 'Não foi possível concluir o cadastro.');
      try { sessionStorage.removeItem(GOOGLE_SIGNUP_KEY); } catch { /* ok */ }
      rememberLogin();
      window.location.href = landingFor(body.user?.papel, null);
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Erro inesperado.'); } finally { setLoading(false); }
  }

  if (pending === undefined) return <p aria-busy="true">Carregando…</p>;
  if (!pending) return <div className="notice" role="status"><p>Sua confirmação com o Google não foi encontrada ou expirou.</p><p><Link href={convite ? `/cadastro?convite=${encodeURIComponent(convite)}` : '/cadastro'}>Voltar ao cadastro</Link></p></div>;
  return <form onSubmit={submit}>
    <div className="field"><label htmlFor="g-nome">Nome</label><input id="g-nome" value={pending.nome} readOnly /></div>
    <div className="field"><label htmlFor="g-email">E-mail (da sua conta Google)</label><input id="g-email" value={pending.email} readOnly /></div>
    <div className="form-row">
      <div className="field"><label htmlFor="cpf">CPF (somente números)</label><input id="cpf" name="cpf" inputMode="numeric" pattern="[0-9]{11}" maxLength={11} required /></div>
      <div className="field"><label htmlFor="telefone">Telefone com DDD</label><input id="telefone" name="telefone" type="tel" inputMode="tel" autoComplete="tel" placeholder="(11) 91234-5678" minLength={10} maxLength={16} required /></div>
    </div>
    <div className="field"><label htmlFor="chavePix">Sua chave Pix</label><input id="chavePix" name="chavePix" required minLength={5} maxLength={140} autoComplete="off" placeholder="CPF, e-mail, telefone ou chave aleatória" /><small className="field-hint">Usada só para pagar prêmios e devolver valores. Você pode trocar depois em Minha conta.</small></div>
    <fieldset className="register-address"><legend>Seu endereço</legend><small className="field-hint">Vai na nota fiscal das suas compras. Digite o CEP e o resto aparece sozinho.</small><AddressFields idPrefix="g-end" /></fieldset>
    <fieldset className="register-accepts"><legend className="sr-only">Aceites obrigatórios</legend>
      <label className="field-check"><input type="checkbox" name="aceiteTermos" required /> <span>Li e aceito os <Link href="/termos" target="_blank" rel="noopener">Termos de Uso</Link>.</span></label>
      <label className="field-check"><input type="checkbox" name="aceitePrivacidade" required /> <span>Li e aceito a <Link href="/privacidade" target="_blank" rel="noopener">Política de Privacidade (LGPD)</Link>.</span></label>
      <label className="field-check"><input type="checkbox" name="maiorDeIdade" required /> <span>Declaro que tenho 18 anos ou mais.</span></label>
    </fieldset>
    {message && <div className="form-message form-error" role="alert">{message}</div>}
    <button className="button button-primary" disabled={loading}>{loading ? 'Aguarde…' : 'Concluir cadastro'}</button>
    <p className="form-foot">Você entra sempre com o Google. Se quiser uma senha própria, use “Esqueci minha senha” na tela de entrada.</p>
  </form>;
}
