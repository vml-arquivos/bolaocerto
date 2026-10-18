/** fetch com cookie e renovação automática da sessão (uma tentativa). Uso exclusivo em componentes de cliente. */
export async function authenticatedFetch(path: string, options?: RequestInit) {
  let response = await fetch(path, { ...options, credentials: 'include' });
  if (response.status === 401) { const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' }); if (refresh.ok) response = await fetch(path, { ...options, credentials: 'include' }); }
  return response;
}
