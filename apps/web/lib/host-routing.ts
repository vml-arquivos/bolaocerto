/**
 * Endereço próprio para o painel (ex.: admin.seudominio.com.br).
 * Só age quando ADMIN_HOST está definido; sem a variável, tudo funciona como antes.
 */
export type HostRoute = { action: 'next' } | { action: 'redirect'; url: string };

const ADMIN_HOST_ALLOWED = ['/admin', '/esqueci-senha', '/redefinir-senha', '/instalar', '/.well-known'];

export function cleanHost(value: string | null | undefined) {
  return (value ?? '').split(',')[0]!.trim().toLowerCase().replace(/:\d+$/, '');
}

export function routeByHost(input: { host: string | null; adminHost: string | undefined; pathname: string; search?: string; proto?: string | null }): HostRoute {
  const adminHost = cleanHost(input.adminHost);
  if (!adminHost) return { action: 'next' };
  const host = cleanHost(input.host);
  const proto = input.proto === 'http' ? 'http' : 'https';
  const search = input.search ?? '';
  const path = input.pathname;
  const isAdminPath = path === '/admin' || path.startsWith('/admin/');
  if (host === adminHost) {
    if (isAdminPath) return { action: 'next' };
    if (ADMIN_HOST_ALLOWED.some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) return { action: 'next' };
    return { action: 'redirect', url: `${proto}://${adminHost}/admin` };
  }
  // Qualquer outro endereço (site dos clientes): o painel vai para o endereço dele.
  if (isAdminPath) return { action: 'redirect', url: `${proto}://${adminHost}${path}${search}` };
  return { action: 'next' };
}
