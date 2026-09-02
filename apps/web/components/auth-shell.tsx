import Link from 'next/link';
import { AuthForm } from './auth-form';
import { ThemeToggle } from './theme-toggle';

function BrandMark() {
  return <span className="brand-icon"><img src="/brand/bl-app-icon.png" alt="" aria-hidden="true" /></span>;
}

export function AuthShell({ mode }: { mode: 'login' | 'register' }) {
  const register = mode === 'register';
  return <main className="auth-layout" id="main-content"><section className="auth-brand-panel"><div><Link className="brand auth-brand" href="/"><BrandMark /><span><strong>Bolão Livre</strong></span></Link><h1>{register ? 'Sua participação começa aqui.' : 'Bem-vindo de volta ao BL.'}</h1><p>Acompanhe concursos, reservas, pagamentos, comprovantes e resultados em uma experiência única.</p></div></section><section className="auth-form-panel"><ThemeToggle /><div className="form-card"><Link className="brand" href="/"><BrandMark /><span><strong>Bolão Livre</strong><small>Concursos oficiais</small></span></Link><h2>{register ? 'Criar conta' : 'Entrar'}</h2><p>{register ? 'Cadastro exclusivo para maiores de 18 anos.' : 'Acesse suas cotas e acompanhe as participações.'}</p><AuthForm mode={mode}/></div></section></main>;
}
