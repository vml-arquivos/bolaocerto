/**
 * Endereço público do site (https://bolaolivre.com), para montar redirecionamentos.
 *
 * Atrás do proxy (Coolify/Traefik) o Next recebe a requisição no endereço interno (0.0.0.0:3000), então
 * `new URL(caminho, request.url)` mandaria a pessoa para um endereço que não abre fora do servidor.
 * O endereço de verdade vem dos cabeçalhos do proxy (x-forwarded-host / x-forwarded-proto).
 */
export type OriginInput = { host?: string | null; forwardedHost?: string | null; forwardedProto?: string | null; requestUrl: string; production?: boolean; fallback?: string | null };

const INTERNAL = /^(0\.0\.0\.0|127\.0\.0\.1|localhost|\[::1?\]|::1?)(:\d+)?$/i;
const first = (value?: string | null) => (value ?? '').split(',')[0]!.trim();

export function publicOrigin({ host, forwardedHost, forwardedProto, requestUrl, production = false, fallback }: OriginInput): string {
  const candidates = [first(forwardedHost), first(host)].filter(Boolean);
  const real = candidates.find((value) => !INTERNAL.test(value));
  const requestProto = (() => { try { return new URL(requestUrl).protocol.replace(':', ''); } catch { return 'http'; } })();
  if (real) {
    const proto = first(forwardedProto) || (production ? 'https' : requestProto);
    return `${proto === 'http' || proto === 'https' ? proto : 'https'}://${real}`;
  }
  // Só o endereço interno chegou (proxy sem os cabeçalhos): usa o endereço público configurado, se houver.
  try { if (fallback) return new URL(fallback).origin; } catch { /* configuração inválida: ignora */ }
  try { return new URL(requestUrl).origin; } catch { return 'http://localhost:3000'; }
}
