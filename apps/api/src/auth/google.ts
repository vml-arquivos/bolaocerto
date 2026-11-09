/** Verificação do "Entrar com Google": confere o ID token com o Google e exige e-mail verificado e o nosso client id. */
export interface GoogleIdentity { sub: string; email: string; nome: string }

const ISSUERS = new Set(['accounts.google.com', 'https://accounts.google.com']);

export type FetchLike = (url: string) => Promise<{ ok: boolean; json: () => Promise<unknown> }>;

export async function verifyGoogleIdToken(credential: string, clientId: string, fetchImpl: FetchLike = (url) => fetch(url) as never, nowMs = Date.now()): Promise<GoogleIdentity | null> {
  if (!clientId || !credential || credential.length > 4096) return null;
  let body: Record<string, unknown>;
  try {
    const response = await fetchImpl(`https://oauth2.googleapis.com/tokeninfo?id_token=${encodeURIComponent(credential)}`);
    if (!response.ok) return null;
    body = (await response.json()) as Record<string, unknown>;
  } catch { return null; }
  const email = typeof body.email === 'string' ? body.email.toLowerCase().trim() : '';
  const verified = body.email_verified === true || body.email_verified === 'true';
  const expMs = Number(body.exp) * 1000;
  if (body.aud !== clientId || !ISSUERS.has(String(body.iss)) || !verified || !email || typeof body.sub !== 'string' || !body.sub) return null;
  if (!Number.isFinite(expMs) || expMs <= nowMs) return null;
  const nome = typeof body.name === 'string' && body.name.trim().length >= 2 ? body.name.trim().slice(0, 150) : email.split('@')[0]!;
  return { sub: body.sub, email, nome };
}

/** Papéis que podem entrar só com Google. Equipe e administradores continuam com e-mail, senha e 2FA. */
export const GOOGLE_LOGIN_ROLES = new Set(['cotista', 'afiliado']);
