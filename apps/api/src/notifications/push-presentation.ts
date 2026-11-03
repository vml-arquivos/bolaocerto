/** Como cada aviso aparece no celular: emoji, imagem grande, botão e urgência. */
export type PushAction = { action: string; title: string };
export type PushStyle = { emoji: string; hero?: 'premio' | 'bl'; urgente?: boolean; acao?: string };

export const PUSH_STYLES: Record<string, PushStyle> = {
  'cota.premiada': { emoji: '🎉', hero: 'premio', urgente: true, acao: 'Ver minha cota' },
  'pagamento.confirmado': { emoji: '✅', acao: 'Ver recibo' },
  'bolao.liberado': { emoji: '🍀', hero: 'bl', acao: 'Ver o bolão' },
  'bolao.apurado': { emoji: '🏁', acao: 'Ver resultado' },
  'cota.recibo': { emoji: '🧾', acao: 'Ver comprovante' },
  comunicado: { emoji: '📣' },
  'afiliado.aprovado': { emoji: '🤝', hero: 'bl', acao: 'Abrir minha área' },
  'grupo.novo_membro': { emoji: '👥', acao: 'Ver meu grupo' },
  'venda.confirmada': { emoji: '💰', acao: 'Ver minhas vendas' },
  'bolao.aprovacao_solicitada': { emoji: '📝', urgente: true, acao: 'Analisar agora' },
  'bolao.aprovado': { emoji: '✅', acao: 'Ver o bolão' },
  'bolao.aprovacao_recusada': { emoji: '⚠️', acao: 'Ajustar o bolão' },
  'comissao.paga': { emoji: '💸', acao: 'Ver comissões' },
  'afiliado.comissao_alterada': { emoji: '📄', urgente: true, acao: 'Ler o contrato' },
  'afiliado.contrato_pendente': { emoji: '✍️', acao: 'Ler o contrato' },
};

export type PushPresentation = { titulo: string; mensagem: string; tag?: string; imagem?: string; urgente: boolean; acoes: PushAction[]; tipo: string };

/** Monta o aviso do celular a partir do tipo e do texto padrão. O título ganha o emoji do tipo. */
export function presentPush(tipo: string | undefined, titulo: string, mensagem: string): PushPresentation {
  const style = tipo ? PUSH_STYLES[tipo] : undefined;
  const clean = titulo.replace(/^\p{Extended_Pictographic}️?\s*/u, '');
  return {
    titulo: `${style ? `${style.emoji} ` : ''}${clean}`.slice(0, 120),
    mensagem: mensagem.slice(0, 300),
    tag: tipo,
    imagem: style?.hero ? `/brand/push-hero-${style.hero}.png` : undefined,
    urgente: Boolean(style?.urgente),
    acoes: style?.acao ? [{ action: 'abrir', title: style.acao }] : [],
    tipo: tipo ?? 'aviso',
  };
}
