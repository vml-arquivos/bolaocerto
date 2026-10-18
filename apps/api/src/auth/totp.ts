import { createCipheriv, createDecipheriv, createHash, createHmac, randomBytes, timingSafeEqual } from 'crypto';

/** TOTP (RFC 6238, SHA-1, 6 dígitos, 30 s) compatível com Google Authenticator, Authy, 1Password etc. Sem dependências externas. */

const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';

export function base32Encode(buffer: Buffer): string {
  let bits = 0; let value = 0; let out = '';
  for (const byte of buffer) {
    value = (value << 8) | byte; bits += 8;
    while (bits >= 5) { out += B32[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += B32[(value << (5 - bits)) & 31];
  return out;
}

export function base32Decode(text: string): Buffer {
  const clean = text.toUpperCase().replace(/[^A-Z2-7]/g, '');
  let bits = 0; let value = 0; const bytes: number[] = [];
  for (const char of clean) {
    value = (value << 5) | B32.indexOf(char); bits += 5;
    if (bits >= 8) { bytes.push((value >>> (bits - 8)) & 255); bits -= 8; }
  }
  return Buffer.from(bytes);
}

export function generateTotpSecret(): string { return base32Encode(randomBytes(20)); }

export function totpCode(secret: string, timeMs = Date.now(), stepSeconds = 30): string {
  const counter = Math.floor(timeMs / 1000 / stepSeconds);
  const buffer = Buffer.alloc(8);
  buffer.writeBigUInt64BE(BigInt(counter));
  const hmac = createHmac('sha1', base32Decode(secret)).update(buffer).digest();
  const offset = (hmac[hmac.length - 1] as number) & 0x0f;
  const binary = (((hmac[offset] as number) & 0x7f) << 24) | (((hmac[offset + 1] as number) & 0xff) << 16) | (((hmac[offset + 2] as number) & 0xff) << 8) | ((hmac[offset + 3] as number) & 0xff);
  return String(binary % 1_000_000).padStart(6, '0');
}

/** Aceita o código atual e o da janela anterior/seguinte (relógios levemente fora de hora). */
export function verifyTotp(secret: string, code: string, timeMs = Date.now()): boolean {
  const given = String(code ?? '').replace(/\s/g, '');
  if (!/^\d{6}$/.test(given)) return false;
  let ok = false;
  for (const drift of [-1, 0, 1]) {
    const expected = Buffer.from(totpCode(secret, timeMs + drift * 30_000));
    if (timingSafeEqual(expected, Buffer.from(given))) ok = true;
  }
  return ok;
}

export function otpauthUrl(secret: string, account: string, issuer = 'BL Bolão Livre'): string {
  return `otpauth://totp/${encodeURIComponent(`${issuer}:${account}`)}?secret=${secret}&issuer=${encodeURIComponent(issuer)}&algorithm=SHA1&digits=6&period=30`;
}

// ── Códigos de recuperação ──
export function generateRecoveryCodes(count = 8): string[] {
  return Array.from({ length: count }, () => { const raw = randomBytes(5).toString('hex').toUpperCase(); return `${raw.slice(0, 5)}-${raw.slice(5)}`; });
}
export const hashRecoveryCode = (code: string): string => createHash('sha256').update(code.toUpperCase().replace(/[^A-Z0-9]/g, '')).digest('hex');

// ── Proteção do segredo no banco ──
/** Com TOTP_ENC_KEY o segredo vai criptografado (AES-256-GCM). Sem ela, fica em texto (marcado) para não travar o login se o ambiente mudar. */
export function sealSecret(secret: string, key?: string): string {
  if (!key) return `plain:${secret}`;
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', createHash('sha256').update(key).digest(), iv);
  const data = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `enc1:${iv.toString('base64')}:${cipher.getAuthTag().toString('base64')}:${data.toString('base64')}`;
}
export function openSecret(stored: string, key?: string): string | null {
  if (stored.startsWith('plain:')) return stored.slice(6);
  if (!stored.startsWith('enc1:') || !key) return null;
  try {
    const [, iv, tag, data] = stored.split(':');
    const decipher = createDecipheriv('aes-256-gcm', createHash('sha256').update(key).digest(), Buffer.from(iv as string, 'base64'));
    decipher.setAuthTag(Buffer.from(tag as string, 'base64'));
    return Buffer.concat([decipher.update(Buffer.from(data as string, 'base64')), decipher.final()]).toString('utf8');
  } catch { return null; }
}
