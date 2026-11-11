/** Telas do painel que ficam juntas, como abas de um mesmo item do menu. A chave de cada aba continua sendo `?view=`, então os links antigos seguem valendo. */
export type HubTab = readonly [view: string, label: string];
export type Hub = { key: string; label: string; icon: string; entry: string; tabs: readonly HubTab[]; aliases?: readonly string[] };

export const ADMIN_HUBS: readonly Hub[] = [
  { key: 'boloes', label: 'Bolões', icon: 'BO', entry: 'boloes', tabs: [['boloes', 'Bolões'], ['jogos', 'Jogos e apostas'], ['cotas', 'Cotas vendidas'], ['controle', 'Acompanhar bolão']] },
  { key: 'financeiro', label: 'Financeiro', icon: 'FN', entry: 'financeiro', aliases: ['pagamentos'], tabs: [['financeiro', 'Painel'], ['recebimentos', 'Recebimentos'], ['comissoes', 'Comissões'], ['repasses', 'Pagar comissões'], ['notas-fiscais', 'Notas fiscais'], ['carteira', 'Carteira dos clientes'], ['cupons', 'Cupons e cashback']] },
  { key: 'integracoes', label: 'Integrações', icon: 'CX', entry: 'conexoes', tabs: [['conexoes', 'Conexões'], ['integ-nfse', 'Nota fiscal'], ['integ-pagamentos', 'Pagamentos'], ['integ-caixa', 'CAIXA']] },
  { key: 'operacao', label: 'Operação', icon: 'OP', entry: 'operacao', tabs: [['operacao', 'Para fazer'], ['comprovantes', 'Comprovantes'], ['lotericas', 'Lotéricas'], ['comunicados', 'Mensagens aos clientes']] },
];

/** Hub a que a tela pertence (ou null). Serve para marcar o item do menu e mostrar as abas. */
export function hubOf(view: string): Hub | null {
  return ADMIN_HUBS.find((hub) => hub.tabs.some(([key]) => key === view) || hub.aliases?.includes(view)) ?? null;
}

/** Título da barra de cima para uma tela. */
export function viewTitle(view: string, fallback = 'Painel'): string {
  for (const hub of ADMIN_HUBS) {
    const tab = hub.tabs.find(([key]) => key === view);
    if (tab) return hub.tabs.length > 1 && hub.key !== tab[0] ? `${hub.label} · ${tab[1]}` : hub.label;
  }
  return fallback;
}
