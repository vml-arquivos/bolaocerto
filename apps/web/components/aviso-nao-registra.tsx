/**
 * Aviso público: o BL organiza bolões, mas não registra jogos nem é lotérica ou a CAIXA.
 * Texto único, usado no rodapé do site, no rodapé do aplicativo e na tela de pagamento.
 */
export const AVISO_NAO_REGISTRA_RESUMO = 'O Bolão Livre não é lotérica, casa de apostas nem a CAIXA e não registra jogos por conta própria, como elas fazem. É uma plataforma de tecnologia que organiza bolões de loterias oficiais: o Bolão Livre registra os jogos do bolão nos canais oficiais da CAIXA: em lotérica credenciada ou na própria CAIXA. O prêmio é pago pela CAIXA conforme o resultado oficial.';
export const AVISO_NAO_REGISTRA_TAXA = 'O Bolão Livre cobra apenas a taxa de serviço pela plataforma e pela administração do bolão.';

export function AvisoNaoRegistra({ compact = false, className = '' }: { compact?: boolean; className?: string }) {
  return <aside className={`aviso-nao-registra ${compact ? 'is-compact' : ''} ${className}`.trim()} role="note" aria-label="Aviso importante">
    <strong>Aviso importante.</strong> {AVISO_NAO_REGISTRA_RESUMO}{!compact && <> {AVISO_NAO_REGISTRA_TAXA}</>}
  </aside>;
}
