import type { ReactNode } from 'react';

/* Ícones do menu do painel: traço fino, mesmo tamanho e mesma espessura em todos (24×24, traço 1,75). */
const P: Record<string, ReactNode> = {
  'visao-geral': <><rect x="3.5" y="3.5" width="7" height="8" rx="1.5" /><rect x="13.5" y="3.5" width="7" height="5" rx="1.5" /><rect x="13.5" y="11.5" width="7" height="9" rx="1.5" /><rect x="3.5" y="14.5" width="7" height="6" rx="1.5" /></>,
  relatorios: <><path d="M4 20V4" /><path d="M4 20h16" /><path d="M8 16v-5" /><path d="M12.5 16V8" /><path d="M17 16v-3" /></>,
  concursos: <><rect x="3.5" y="5" width="17" height="15.5" rx="2" /><path d="M3.5 10h17" /><path d="M8 3v4" /><path d="M16 3v4" /></>,
  boloes: <><path d="m12 3.5 8.5 4.25L12 12 3.5 7.75 12 3.5Z" /><path d="m3.5 12 8.5 4.25L20.5 12" /><path d="m3.5 16.25 8.5 4.25 8.5-4.25" /></>,
  crm: <><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20c.6-3.5 3.2-5.5 6.5-5.5s5.9 2 6.5 5.5" /><path d="M16 4.7a3.5 3.5 0 0 1 0 6.6" /><path d="M18.5 14.8c1.7.8 2.8 2.6 3 5.2" /></>,
  afiliados: <><circle cx="10" cy="8" r="3.5" /><path d="M3.5 20c.6-3.5 3.2-5.5 6.5-5.5 1.4 0 2.7.4 3.7 1.1" /><path d="m15.5 18 2 2 4-4.5" /></>,
  contratos: <><path d="M14 3.5H7A2.5 2.5 0 0 0 4.5 6v12A2.5 2.5 0 0 0 7 20.5h10a2.5 2.5 0 0 0 2.5-2.5V9L14 3.5Z" /><path d="M14 3.5V9h5.5" /><path d="M8.5 13h7" /><path d="M8.5 16.5h4" /></>,
  ranking: <><path d="M8 20.5h8" /><path d="M12 16.5v4" /><path d="M7 4.5h10v5a5 5 0 0 1-10 0v-5Z" /><path d="M7 6.5H4.5v1.5A3 3 0 0 0 7.5 11" /><path d="M17 6.5h2.5v1.5a3 3 0 0 1-3 3" /></>,
  grupos: <><path d="M20.5 11.5a8 8 0 0 1-11.8 7L3.5 20l1.5-4.6A8 8 0 1 1 20.5 11.5Z" /><path d="M8.5 11.5h.01" /><path d="M12.5 11.5h.01" /><path d="M16.5 11.5h.01" /></>,
  depoimentos: <><path d="m12 3.5 2.6 5.3 5.9.9-4.3 4.1 1 5.8-5.2-2.7-5.2 2.7 1-5.8-4.3-4.1 5.9-.9L12 3.5Z" /></>,
  vitrine: <><path d="M3.5 10.5 12 3.5l8.5 7" /><path d="M5.5 9v11.5h13V9" /><path d="M10 20.5v-6h4v6" /></>,
  blog: <><path d="M12 20.5h8.5" /><path d="M16.5 3.8a2.1 2.1 0 0 1 3 3L7.5 18.8l-4 1 1-4 12-12Z" /></>,
  usuarios: <><path d="M12 3 4.5 6v5.5c0 4.6 3.2 8.4 7.5 9.5 4.3-1.1 7.5-4.9 7.5-9.5V6L12 3Z" /><path d="m8.8 12 2.2 2.2 4.3-4.4" /></>,
  documentos: <><path d="M3.5 7A2.5 2.5 0 0 1 6 4.5h3.6l2 2.5H18A2.5 2.5 0 0 1 20.5 9.5V17A2.5 2.5 0 0 1 18 19.5H6A2.5 2.5 0 0 1 3.5 17V7Z" /></>,
  funil: <><path d="M3.5 4.5h17l-6.5 8v6l-4 2v-8l-6.5-8Z" /></>,
  conexoes: <><path d="M9 3.5v5" /><path d="M15 3.5v5" /><path d="M6.5 8.5h11v3a5.5 5.5 0 0 1-11 0v-3Z" /><path d="M12 17v3.5" /></>,
  auditoria: <><path d="M3.5 12a8.5 8.5 0 1 0 2.5-6" /><path d="M3.5 4.5V8.5h4" /><path d="M12 7.5V12l3 2" /></>,
  configuracoes: <><path d="M4 6.5h9" /><path d="M17 6.5h3" /><circle cx="15" cy="6.5" r="2" /><path d="M4 12h3" /><path d="M11 12h9" /><circle cx="9" cy="12" r="2" /><path d="M4 17.5h11" /><path d="M19 17.5h1" /><circle cx="17" cy="17.5" r="2" /></>,
  financeiro: <><path d="M19.5 7.5V6A2.5 2.5 0 0 0 17 3.5H6A2.5 2.5 0 0 0 3.5 6v12A2.5 2.5 0 0 0 6 20.5h11a2.5 2.5 0 0 0 2.5-2.5v-1.5" /><path d="M20.5 9.5h-5a2.5 2.5 0 0 0 0 5h5v-5Z" /><path d="M16 12h.01" /></>,
  operacao: <><rect x="5" y="4.5" width="14" height="16" rx="2" /><path d="M9 3.5h6v2.5H9z" /><path d="m9 13 2 2 4-4.5" /></>,
  conta: <><circle cx="12" cy="8" r="4" /><path d="M4.5 20.5c.8-4 3.8-6 7.5-6s6.7 2 7.5 6" /></>,
  sair: <><path d="M14 4.5h3.5A2 2 0 0 1 19.5 6.5v11a2 2 0 0 1-2 2H14" /><path d="M10 16.5 5.5 12 10 7.5" /><path d="M5.5 12h9" /></>,
  site: <><path d="M13.5 4.5h6v6" /><path d="m19.5 4.5-8 8" /><path d="M18 14v4a2.5 2.5 0 0 1-2.5 2.5H6A2.5 2.5 0 0 1 3.5 18V8.5A2.5 2.5 0 0 1 6 6h4" /></>,
  instalar: <><path d="M12 3.5v11" /><path d="m7.5 10 4.5 4.5 4.5-4.5" /><path d="M4.5 19.5h15" /></>,
  recolher: <><path d="m14.5 6.5-5.5 5.5 5.5 5.5" /></>,
};

export function NavIcon({ name, fallback }: { name: string; fallback?: string }) {
  const paths = P[name];
  if (!paths) return <span className="admin-nav-letters">{fallback}</span>;
  return <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">{paths}</svg>;
}
