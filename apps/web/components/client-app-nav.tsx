'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
const links = [ ['/aplicativo', 'Bolões', '▦'], ['/minha-conta', 'Minhas cotas', '◉'], ['/resultados', 'Resultados', '✓'], ['/minha-conta/contratos', 'Contratos', '▤'], ['/aplicativo/mais', 'Mais', '•••'] ];
export function ClientAppNav() {
  const pathname = usePathname();
  if (/^\/(admin|afiliado|operacao)(\/|$)/.test(pathname)) return null;
  return <nav className="client-app-nav" aria-label="Navegação do aplicativo">{links.map(([href, title, icon]) => <Link key={href} href={href!} aria-current={pathname === href ? 'page' : undefined}><span aria-hidden="true">{icon}</span><span>{title}</span></Link>)}</nav>;
}
