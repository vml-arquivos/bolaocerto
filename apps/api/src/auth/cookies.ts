import { Response } from 'express';


/**
 * Cookies de sessão: sem data de validade, somem quando o navegador (a janela) é fechado.
 * O tempo sem uso é controlado pelo prazo do próprio token de renovação (ver session-policy.ts).
 */
export function setAuthCookies(response: Response, accessToken: string, refreshToken: string): void {
  const secure = process.env.NODE_ENV === 'production';
  response.cookie('access_token', accessToken, { httpOnly: true, sameSite: 'lax', secure, path: '/api/v1' });
  response.cookie('refresh_token', refreshToken, { httpOnly: true, sameSite: 'lax', secure, path: '/api/v1/auth' });
}

export function clearAuthCookies(response: Response): void {
  const secure = process.env.NODE_ENV === 'production';
  response.clearCookie('access_token', { httpOnly: true, sameSite: 'lax', secure, path: '/api/v1' });
  response.clearCookie('refresh_token', { httpOnly: true, sameSite: 'lax', secure, path: '/api/v1/auth' });
}
