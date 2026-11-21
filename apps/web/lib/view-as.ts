/** Modo "ver como": a conta principal vê o painel como outra pessoa da equipe (só para olhar). */
export const VIEW_AS_COOKIE = 'bl_ver_como';

export function viewAsId(): string | null {
  if (typeof document === 'undefined') return null;
  const match = document.cookie.split(';').map((part) => part.trim()).find((part) => part.startsWith(`${VIEW_AS_COOKIE}=`));
  const value = match ? decodeURIComponent(match.slice(VIEW_AS_COOKIE.length + 1)) : '';
  return /^[0-9a-f-]{36}$/i.test(value) ? value : null;
}

export function startViewAs(userId: string): void {
  const secure = typeof location !== 'undefined' && location.protocol === 'https:' ? '; Secure' : '';
  document.cookie = `${VIEW_AS_COOKIE}=${encodeURIComponent(userId)}; Path=/; Max-Age=7200; SameSite=Strict${secure}`;
  window.location.href = '/admin';
}

export function stopViewAs(next = '/admin?view=usuarios'): void {
  document.cookie = `${VIEW_AS_COOKIE}=; Path=/; Max-Age=0; SameSite=Strict`;
  window.location.href = next;
}
