// Mesma regra da API: mínimo 8 caracteres, com pelo menos uma letra e um número. Sem limite prático de tamanho (o teto é só técnico).
export const PASSWORD_MIN = 8;
export const PASSWORD_MAX = 1024;
export const PASSWORD_HINT = 'Mínimo 8 caracteres, com letras e números.';

export function passwordProblem(value: string): string | null {
  if (value.length < PASSWORD_MIN) return 'A senha precisa ter no mínimo 8 caracteres.';
  if (value.length > PASSWORD_MAX) return `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.`;
  if (!/\p{L}/u.test(value)) return 'Inclua pelo menos uma letra na senha.';
  if (!/\d/.test(value)) return 'Inclua pelo menos um número na senha.';
  return null;
}
