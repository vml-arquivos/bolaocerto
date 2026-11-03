// Mesma regra da API: mínimo 6 caracteres, com pelo menos uma letra e um número. O tamanho máximo é só um limite técnico.
export const PASSWORD_MIN = 6;
export const PASSWORD_MAX = 128;
export const PASSWORD_HINT = 'Mínimo 6 caracteres, com letras e números.';

export function passwordProblem(value: string): string | null {
  if (value.length < PASSWORD_MIN) return 'A senha precisa ter no mínimo 6 caracteres.';
  if (value.length > PASSWORD_MAX) return `A senha pode ter no máximo ${PASSWORD_MAX} caracteres.`;
  if (!/\p{L}/u.test(value)) return 'Inclua pelo menos uma letra na senha.';
  if (!/\d/.test(value)) return 'Inclua pelo menos um número na senha.';
  return null;
}
