/** Regras do logout por inatividade (a API aplica o mesmo prazo no token de renovação). */
export const IDLE_STORAGE = { activity: 'bl-last-activity', refresh: 'bl-last-refresh', hint: 'bl-session-hint' } as const;

/** Passou do tempo sem mexer em nada? `lastActivity` vazio (0) não conta como ocioso. */
export function isIdle(lastActivity: number, now: number, limitMinutes: number): boolean {
  return lastActivity > 0 && now - lastActivity > limitMinutes * 60_000;
}

/** De quanto em quanto tempo a tela renova a sessão enquanto a pessoa está usando: bem antes do limite. */
export function heartbeatMs(limitMinutes: number): number {
  return Math.min(10 * 60_000, Math.max(60_000, Math.floor((limitMinutes * 60_000) / 3)));
}

/** Entrada de cada tipo de conta. */
export function loginPathFor(papel: string | null | undefined): string {
  if (papel === 'admin' || papel === 'operacao') return '/admin/entrar';
  if (papel === 'afiliado') return '/afiliado/entrar';
  return '/login';
}

/** Páginas que só fazem sentido logado: nelas o cliente é levado ao login; nas públicas só sai da conta. */
export function isProtectedPath(pathname: string): boolean {
  return ['/admin', '/afiliado', '/aplicativo', '/minha-conta', '/checkout'].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export const IDLE_NOTICE = 'Por segurança, sua sessão terminou depois de um tempo sem uso. Entre de novo para continuar.';
