/**
 * Funções do painel que a conta principal (superadmin) libera ou bloqueia para cada pessoa da equipe.
 * A mesma lista existe no site (apps/web/lib/access.ts): as chaves precisam ser iguais.
 */
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

export type AccessModule = (typeof ACCESS_MODULES)[number]['key'];
export const ACCESS_KEYS: readonly string[] = ACCESS_MODULES.map((item) => item.key);

/** Funções que, por padrão, só a conta principal usa (o administrador comum só as vê se forem liberadas). */
export const SUPER_MODULES: readonly string[] = ['documentos', 'conexoes', 'auditoria', 'configuracoes'];

/** O que cada perfil tem quando a conta principal não personalizou nada (é o comportamento de antes). */
export function defaultModules(papel?: string | null): string[] {
  if (papel === 'admin') return ACCESS_KEYS.filter((key) => !SUPER_MODULES.includes(key));
  if (papel === 'operacao') return ['operacao'];
  return [];
}

type RouteRule = { prefix: string; read: string[]; write: string[] };
const R = (prefix: string, read: string[], write: string[] = [read[0]!]): RouteRule => ({ prefix, read, write });

/**
 * Qual função cada rota do painel usa. Leitura vale para várias telas (ex.: a lista de concursos aparece no assistente de
 * bolão); gravação vale só para a função dona. Rota fora desta lista segue só a regra de perfil, como antes.
 */
const ROUTES: RouteRule[] = [
  R('admin/dashboard', ['visao-geral']),
  R('admin/relatorios', ['relatorios', 'financeiro', 'notas-fiscais', 'comissoes']),
  R('admin/downloads', ['relatorios', 'notas-fiscais', 'financeiro', 'cotas']),
  R('admin/estatisticas', ['visao-geral', 'relatorios', 'concursos', 'boloes']),
  R('admin/concursos', ['concursos', 'boloes', 'visao-geral', 'relatorios', 'financeiro', 'operacao', 'cotas'], ['concursos', 'boloes']),
  R('admin/boloes', ['boloes', 'cotas', 'crm', 'comunicados', 'relatorios', 'financeiro', 'notas-fiscais', 'operacao', 'visao-geral'], ['boloes']),
  R('admin/numeros', ['boloes'], ['boloes']),
  R('admin/loterias/precos', ['boloes', 'concursos'], ['boloes']),
  R('admin/cotas', ['cotas', 'boloes', 'crm', 'financeiro', 'notas-fiscais', 'relatorios'], ['cotas', 'boloes']),
  R('admin/pedidos-cancelamento', ['cotas', 'boloes', 'crm'], ['cotas']),
  R('admin/crm', ['crm', 'cupons', 'comunicados'], ['crm']),
  R('admin/comunidade', ['crm', 'comunicados', 'vitrine'], ['crm', 'comunicados']),
  R('admin/afiliados', ['afiliados', 'grupos', 'usuarios', 'boloes', 'comissoes'], ['afiliados']),
  R('admin/convites', ['afiliados', 'usuarios'], ['afiliados', 'usuarios']),
  R('admin/grupos', ['grupos', 'boloes', 'afiliados', 'usuarios', 'cupons', 'comunicados', 'crm'], ['grupos', 'afiliados']),
  R('admin/recebimentos', ['financeiro', 'relatorios', 'visao-geral'], ['financeiro']),
  R('admin/financeiro', ['financeiro', 'relatorios'], ['financeiro']),
  R('admin/comissoes', ['comissoes', 'financeiro', 'afiliados'], ['comissoes']),
  R('admin/repasses', ['comissoes', 'financeiro'], ['comissoes']),
  R('admin/notas-fiscais', ['notas-fiscais', 'financeiro'], ['notas-fiscais']),
  R('admin/nfse', ['notas-fiscais', 'financeiro', 'conexoes'], ['notas-fiscais']),
  R('admin/nfse/modo', ['conexoes'], ['conexoes']),
  R('admin/nfse/diagnostico', ['conexoes'], ['conexoes']),
  R('admin/nfse/emissor', ['conexoes'], ['conexoes']),
  R('admin/carteira', ['carteira', 'crm', 'cupons'], ['carteira']),
  R('admin/cupons', ['cupons'], ['cupons']),
  R('admin/cashback-campanhas', ['cupons'], ['cupons']),
  R('admin/promocoes', ['cupons', 'comunicados'], ['cupons']),
  R('admin/operacao', ['operacao', 'boloes', 'cotas'], ['operacao', 'boloes']),
  R('operacao', ['operacao', 'boloes', 'cotas'], ['operacao', 'boloes']),
  R('admin/lotericas', ['lotericas', 'boloes', 'operacao'], ['lotericas']),
  R('admin/comunicados', ['comunicados'], ['comunicados']),
  R('admin/home', ['vitrine'], ['vitrine']),
  R('admin/blog', ['blog'], ['blog']),
  R('admin/seo', ['blog'], ['blog']),
  R('admin/usuarios', ['usuarios', 'afiliados', 'crm', 'financeiro', 'notas-fiscais'], ['usuarios', 'afiliados', 'crm']),
  R('admin/funil', ['funil'], ['funil']),
  R('admin/documentos', ['documentos'], ['documentos']),
  R('admin/conexoes', ['conexoes'], ['conexoes']),
  R('admin/pagamentos', ['conexoes'], ['conexoes']),
  R('admin/auditoria', ['auditoria'], ['auditoria']),
  R('admin/configuracoes', ['configuracoes'], ['configuracoes']),
].sort((a, b) => b.prefix.length - a.prefix.length);

/** Funções que dão acesso a uma rota (vazio = rota sem função: vale só o perfil). `path` sem o prefixo /api/v1. */
export function modulesForRoute(method: string, path: string): string[] {
  const clean = path.replace(/^\/+/, '').replace(/^api\/v1\//, '').replace(/\/+$/, '');
  const rule = ROUTES.find((item) => clean === item.prefix || clean.startsWith(`${item.prefix}/`));
  if (!rule) return [];
  return ['GET', 'HEAD'].includes(method.toUpperCase()) ? rule.read : rule.write;
}
