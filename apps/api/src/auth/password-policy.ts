export const NEW_PASSWORD_MIN_LENGTH = 6;
export const NEW_PASSWORD_MAX_LENGTH = 8;
export const NEW_PASSWORD_MESSAGE = 'A nova senha deve ter de 6 a 8 caracteres, somente números.';

/**
 * Applies only when a password is created or replaced. Login intentionally does
 * not call this function so existing accounts with longer passwords continue
 * to work until their next password change.
 */
export function isValidNewPassword(password: string): boolean {
  return /^\d{6,8}$/.test(password);
}
