/** Moeda em reais. Vazio, nulo ou inválido vira R$ 0,00 (usado em painéis e formulários). */
export function formatBRL(value: unknown) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return 'R$ 0,00';
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}
