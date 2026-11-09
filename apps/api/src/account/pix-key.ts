import { isValidCpf } from '../auth/auth.utils';

export const PIX_KEY_MESSAGE = 'Chave Pix inválida. Use CPF, CNPJ, e-mail, celular com DDD ou chave aleatória.';

export type PixKeyKind = 'cpf' | 'cnpj' | 'email' | 'telefone' | 'aleatoria';

/** Confere e padroniza a chave Pix (CPF, CNPJ, e-mail, celular ou chave aleatória). Devolve null quando não reconhece. */
export function normalizePixKey(raw: string): { valor: string; tipo: PixKeyKind } | null {
  const text = (raw ?? '').trim();
  if (!text || text.length > 140) return null;
  if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(text)) return { valor: text.toLowerCase(), tipo: 'aleatoria' };
  if (text.includes('@')) return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(text) && text.length <= 77 ? { valor: text.toLowerCase(), tipo: 'email' } : null;
  if (!/^[+\d\s()./-]+$/.test(text)) return null;
  const digits = text.replace(/\D/g, '');
  if (text.startsWith('+')) return /^55\d{2}9\d{8}$/.test(digits) ? { valor: `+${digits}`, tipo: 'telefone' } : null;
  if (digits.length === 14) return { valor: digits, tipo: 'cnpj' };
  if (digits.length === 11) {
    if (isValidCpf(digits)) return { valor: digits, tipo: 'cpf' };
    if (/^\d{2}9\d{8}$/.test(digits)) return { valor: `+55${digits}`, tipo: 'telefone' };
  }
  return null;
}
