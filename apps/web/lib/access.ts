/**
 * Funções do painel que a conta principal libera ou bloqueia para cada pessoa da equipe.
 * Mesma lista da API (apps/api/src/access/access.catalog.ts): as chaves precisam ser iguais.
 */
import { ADMIN_HUBS } from './admin-nav';
import { STAFF_VIEWS, SUPERADMIN_VIEWS } from './roles';

export const ACCESS_MODULES = [
  { key: 'visao-geral', label: 'Resumo (painel com receita e vendas)', section: 'Painel' },
  { key: 'relatorios', label: 'Relatórios e downloads', section: 'Painel' },
  { key: 'concursos', label: 'Concursos', section: 'Jogos e vendas' },
  { key: 'boloes', label: 'Bolões: criar, editar, jogos e acompanhar', section: 'Jogos e vendas' },
  { key: 'cotas', label: 'Cotas vendidas, venda manual e cancelamentos', section: 'Jogos e vendas' },
  { key: 'crm', label: 'Clientes', section: 'Pessoas' },
  { key: 'afiliados', label: 'Afiliados e convites', section: 'Pessoas' },
  { key: 'grupos', label: 'Grupos', section: 'Pessoas' },
  { key: 'financeiro', label: 'Financeiro: painel e recebimentos', section: 'Financeiro' },
  { key: 'comissoes', label: 'Comissões e pagar comissões', section: 'Financeiro' },
  { key: 'notas-fiscais', label: 'Notas fiscais', section: 'Financeiro' },
  { key: 'carteira', label: 'Carteira dos clientes', section: 'Financeiro' },
  { key: 'cupons', label: 'Cupons e cashback', section: 'Financeiro' },
  { key: 'operacao', label: 'Operação: para fazer e comprovantes', section: 'Operação' },
  { key: 'lotericas', label: 'Lotéricas', section: 'Operação' },
  { key: 'comunicados', label: 'Mensagens aos clientes', section: 'Operação' },
  { key: 'vitrine', label: 'Página inicial do site', section: 'Administração' },
  { key: 'blog', label: 'Blog e SEO', section: 'Administração' },
  { key: 'usuarios', label: 'Usuários e acessos', section: 'Administração' },
  { key: 'funil', label: 'Funil de conversão', section: 'Administração' },
  { key: 'documentos', label: 'Documentos (termos e contratos)', section: 'Administração' },
  { key: 'conexoes', label: 'Integrações (nota fiscal, pagamentos, CAIXA)', section: 'Administração' },
  { key: 'auditoria', label: 'Histórico', section: 'Administração' },
  { key: 'configuracoes', label: 'Configurações', section: 'Administração' },
] as const;

/** Telas (`?view=`) que pertencem a uma função diferente do próprio nome. */
const VIEW_MODULE: Record<string, string> = {
  jogos: 'boloes', controle: 'boloes', convites: 'afiliados', recebimentos: 'financeiro', pagamentos: 'financeiro', repasses: 'comissoes',
  comprovantes: 'operacao', 'integ-nfse': 'conexoes', 'integ-pagamentos': 'conexoes', 'integ-caixa': 'conexoes',
};
const KEYS = new Set<string>(ACCESS_MODULES.map((item) => item.key));

/** Função de uma tela do painel (ou null para tela sem função própria). */
export function viewModule(view: string): string | null {
  const key = VIEW_MODULE[view] ?? view;
  return KEYS.has(key) ? key : null;
}

/**
 * Pode abrir a tela? `modules` vem da API (/auth/me). Sem a lista (API antiga), vale a regra de antes:
 * administrador vê tudo menos a área da conta principal; operação só "Para fazer".
 */
export function canOpenView(view: string, ctx: { role: string; superadmin: boolean; modules: string[] | null }): boolean {
  if (ctx.superadmin) return true;
  if (ctx.modules) {
    const key = viewModule(view);
    return key ? ctx.modules.includes(key) : ctx.role === 'admin';
  }
  if (ctx.role === 'operacao') return (STAFF_VIEWS as readonly string[]).includes(view);
  return !(SUPERADMIN_VIEWS as readonly string[]).includes(view);
}

/** Ordem para achar a primeira tela liberada (quando a tela pedida está bloqueada). */
const LANDING_ORDER = ['visao-geral', 'operacao', 'boloes', 'concursos', 'cotas', 'crm', 'afiliados', 'grupos', 'financeiro', 'recebimentos', 'comissoes', 'repasses', 'notas-fiscais', 'carteira', 'cupons', 'relatorios', 'comprovantes', 'lotericas', 'comunicados', 'vitrine', 'blog', 'usuarios', 'funil', 'documentos', 'conexoes', 'auditoria', 'configuracoes'];
export function firstOpenView(ctx: { role: string; superadmin: boolean; modules: string[] | null }): string | null {
  return LANDING_ORDER.find((view) => canOpenView(view, ctx)) ?? null;
}

/** Item do menu que abre um grupo de abas (Financeiro, Operação, Integrações, Bolões): vai para a primeira aba liberada. */
export function menuTarget(key: string, can: (view: string) => boolean): string | null {
  const hub = ADMIN_HUBS.find((item) => item.entry === key);
  if (!hub) return can(key) ? key : null;
  if (can(key)) return key;
  return hub.tabs.map(([tab]) => tab).find((tab) => can(tab)) ?? null;
}
