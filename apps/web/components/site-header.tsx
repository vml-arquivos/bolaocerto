import Link from 'next/link';

function BrandMark() {
  return <span className="brand-icon"><img src="/brand/bl-app-icon.png" alt="" aria-hidden="true" /></span>;
}

export function SiteHeader() {
  const testMode = process.env.PLATFORM_TEST_MODE === 'true';
  return <>{testMode && <div className="test-banner">Ambiente de validação: não realize pagamentos reais.</div>}<header className="site-header"><div className="shell header-row">
    <Link className="brand" href="/" aria-label="BL — Bolão Livre, página inicial"><BrandMark /><span><strong>Bolão Livre</strong><small>Concursos oficiais</small></span></Link>
    <nav className="main-nav" aria-label="Navegação principal"><Link href="/#modalidades">Modalidades</Link><Link href="/#concursos">Concursos</Link><Link href="/#boloes">Bolões</Link><Link href="/minha-conta">Minhas cotas</Link></nav>
    <div className="header-actions"><Link className="button button-ghost" href="/login">Entrar</Link><Link className="button button-primary" href="/cadastro">Criar conta</Link></div>
  </div></header></>;
}

export function SiteFooter() {
  return <footer className="site-footer"><div className="shell footer-grid"><div><div className="brand footer-brand"><BrandMark /><span><strong>Bolão Livre</strong><small>Experiência BL</small></span></div><p>Participações vinculadas a concursos oficiais, com histórico, clareza e rastreabilidade em cada etapa.</p></div><div><strong>Explorar</strong><Link href="/#modalidades">Modalidades</Link><Link href="/#concursos">Concursos</Link><Link href="/#boloes">Bolões disponíveis</Link></div><div><strong>Suporte e acesso</strong><Link href="/minha-conta">Área do cotista</Link><Link href="/termos">Termos de uso</Link><Link href="/privacidade">Privacidade</Link></div></div><div className="shell legal-line">BL — Bolão Livre não é a CAIXA e não substitui os canais oficiais de loteria. Plataforma independente, com acesso destinado a maiores de 18 anos. Operação comercial sujeita a validação jurídica e contratual.</div></footer>;
}
