'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
const links = [ ['/aplicativo', 'Bolões', '▦'], ['/minha-conta', 'Minhas cotas', '◉'], ['/resultados', 'Resultados', '✓'], ['/aplicativo/mais', 'Mais', '•••'] ];
export function ClientAppNav() {
  const pathname = usePathname();
  // Sem barra de baixo no painel/afiliado e nas telas de entrada (login, cadastro, recuperação de senha).
  if (/^\/(admin|afiliado|operacao|login|cadastro|esqueci-senha|redefinir-senha)(\/|$)/.test(pathname)) return null;
  return <nav className="client-app-nav" aria-label="Navegação do aplicativo">{links.map(([href, title, icon]) => <Link key={href} href={href!} aria-current={pathname === href || (href === '/aplicativo' && pathname.startsWith('/boloes')) ? 'page' : undefined}><span aria-hidden="true">{icon}</span><span>{title}</span></Link>)}</nav>;
}
