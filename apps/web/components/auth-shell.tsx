import Link from 'next/link';
import { AuthForm, type InviteView } from './auth-form';
import { ThemeToggle } from './theme-toggle';

function BrandMark() {
  return <span className="brand-icon"><img src="/brand/bl-app-icon.png" alt="" aria-hidden="true" /></span>;
}

export function AuthShell({ mode, audience = 'cliente', extra, invite }: { mode: 'login' | 'register'; audience?: 'cliente' | 'admin'; extra?: React.ReactNode; invite?: InviteView | null }) {
  const register = mode === 'register';
  const admin = audience === 'admin';
  return <main className="auth-layout" id="main-content"><section className="auth-brand-panel"><div><Link className="brand auth-brand" href="/"><BrandMark /><span><strong>Bolão Livre</strong></span></Link><h1>{admin ? 'Painel da equipe BL.' : register ? (invite?.tipo === 'afiliado' ? 'Seu cadastro de afiliado começa aqui.' : 'Sua participação começa aqui.') : 'Bem-vindo de volta ao BL.'}</h1><p>{admin ? 'Concursos, bolões, cotas, recebimentos e comprovantes em um só lugar. Acesso restrito à equipe.' : 'Acompanhe concursos, reservas, pagamentos, comprovantes e resultados em uma experiência única.'}</p></div></section><section className="auth-form-panel"><ThemeToggle /><div className="form-card"><Link className="brand" href="/"><BrandMark /><span><strong>Bolão Livre</strong><small>Concursos oficiais</small></span></Link><h2>{admin ? 'Entrar no painel' : register ? 'Criar conta' : 'Entrar'}</h2><p>{admin ? 'Use o e-mail e a senha da sua conta de administrador.' : register ? 'Cadastro exclusivo para maiores de 18 anos.' : 'Acesse suas cotas e acompanhe as participações.'}</p><AuthForm mode={mode} audience={audience} invite={invite}/>{extra}</div></section></main>;
}

/** Casca simples (mesma identidade visual) para telas de recuperação de senha. */
export function AuthPanel({ title, subtitle, children }: { title: string; subtitle: string; children: React.ReactNode }) {
  return <main className="auth-layout" id="main-content"><section className="auth-brand-panel"><div><Link className="brand auth-brand" href="/"><BrandMark /><span><strong>Bolão Livre</strong></span></Link><h1>Vamos recuperar o seu acesso.</h1><p>Por segurança, o link de redefinição vale por pouco tempo e só pode ser usado uma vez.</p></div></section><section className="auth-form-panel"><ThemeToggle /><div className="form-card"><Link className="brand" href="/"><BrandMark /><span><strong>Bolão Livre</strong><small>Concursos oficiais</small></span></Link><h2>{title}</h2><p>{subtitle}</p>{children}</div></section></main>;
}
