import { Response } from 'express';

export const ACCESS_COOKIE_MS = 15 * 60 * 1000;
export const REFRESH_COOKIE_MS = 30 * 24 * 60 * 60 * 1000;

export function setAuthCookies(response: Response, accessToken: string, refreshToken: string): void {
  const secure = process.env.NODE_ENV === 'production';
  response.cookie('access_token', accessToken, { httpOnly: true, sameSite: 'lax', secure, maxAge: ACCESS_COOKIE_MS, path: '/api/v1' });
  response.cookie('refresh_token', refreshToken, { httpOnly: true, sameSite: 'lax', secure, maxAge: REFRESH_COOKIE_MS, path: '/api/v1/auth' });
}

export function clearAuthCookies(response: Response): void {
  const secure = process.env.NODE_ENV === 'production';
  response.clearCookie('access_token', { httpOnly: true, sameSite: 'lax', secure, path: '/api/v1' });
  response.clearCookie('refresh_token', { httpOnly: true, sameSite: 'lax', secure, path: '/api/v1/auth' });
}
