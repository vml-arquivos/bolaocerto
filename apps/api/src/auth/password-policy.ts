export const NEW_PASSWORD_MIN_LENGTH = 8;
/** Limite técnico (só para barrar abuso; o hash é argon2, que aceita senhas longas); na prática a pessoa escolhe o tamanho que quiser. */
export const NEW_PASSWORD_MAX_LENGTH = 1024;
export const NEW_PASSWORD_MESSAGE = 'A senha deve ter no mínimo 8 caracteres, com pelo menos uma letra e um número.';
/** Para usar em @Matches(): exige ao menos uma letra e um número. */
export const NEW_PASSWORD_PATTERN = /^(?=.*\p{L})(?=.*\d).+$/u;

/**
 * Applies only when a password is created or replaced. Login intentionally does
 * not call this function so existing accounts (inclusive as senhas só com números
 * criadas antes desta regra) continuam entrando até a próxima troca de senha.
 */
export function isValidNewPassword(password: string): boolean {
  return typeof password === 'string'
    && password.length >= NEW_PASSWORD_MIN_LENGTH
    && password.length <= NEW_PASSWORD_MAX_LENGTH
    && NEW_PASSWORD_PATTERN.test(password);
}
