/**
 * Textos jurídicos definitivos. Quando um texto é preenchido aqui, ele substitui a minuta provisória do sistema
 * (a variável LEGAL_<TIPO>_TEXT, se existir no servidor, continua valendo por cima).
 * Ao mudar o texto, o sistema pede novo aceite de quem já tem conta.
 */
export const LEGAL_TEXTS: Partial<Record<'termos' | 'privacidade' | 'participacao' | 'afiliado', string>> = {
  // termos: `...texto dos Termos de Uso...`,
  // privacidade: `...texto da Política de Privacidade (LGPD)...`,
};
