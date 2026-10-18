import { base32Decode, base32Encode, generateRecoveryCodes, hashRecoveryCode, openSecret, otpauthUrl, sealSecret, totpCode, verifyTotp } from './totp';

describe('TOTP (RFC 6238)', () => {
  // Vetores de teste da RFC 6238 (segredo ASCII "12345678901234567890", SHA-1, 8 dígitos → usamos os 6 finais).
  const secret = base32Encode(Buffer.from('12345678901234567890'));
  it.each([[59, '287082'], [1111111109, '081804'], [1111111111, '050471'], [1234567890, '005924'], [2000000000, '279037']])('gera o código correto em t=%i', (seconds, expected) => {
    expect(totpCode(secret, seconds * 1000)).toBe(expected);
  });

  it('base32 faz ida e volta', () => {
    const raw = Buffer.from('segredo-bl-2fa!');
    expect(base32Decode(base32Encode(raw)).toString()).toBe('segredo-bl-2fa!');
  });

  it('aceita ±1 janela de 30 s e recusa o resto', () => {
    const now = 1_700_000_000_000;
    expect(verifyTotp(secret, totpCode(secret, now), now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now - 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now + 30_000), now)).toBe(true);
    expect(verifyTotp(secret, totpCode(secret, now - 120_000), now)).toBe(false);
    expect(verifyTotp(secret, '12345', now)).toBe(false);
    expect(verifyTotp(secret, 'abcdef', now)).toBe(false);
  });

  it('monta o link otpauth para o QR', () => {
    expect(otpauthUrl('ABC234', 'a@b.com')).toBe('otpauth://totp/BL%20Bol%C3%A3o%20Livre%3Aa%40b.com?secret=ABC234&issuer=BL%20Bol%C3%A3o%20Livre&algorithm=SHA1&digits=6&period=30');
  });

  it('códigos de recuperação: formato, unicidade e hash sem diferenciar maiúsculas/hífen', () => {
    const codes = generateRecoveryCodes();
    expect(new Set(codes).size).toBe(8);
    expect(codes[0]).toMatch(/^[0-9A-F]{5}-[0-9A-F]{5}$/);
    expect(hashRecoveryCode(codes[0]!)).toBe(hashRecoveryCode(codes[0]!.toLowerCase().replace('-', ' ')));
  });

  it('segredo no banco: criptografado com chave, em texto marcado sem chave, e nunca abre com chave errada', () => {
    const sealed = sealSecret('JBSWY3DPEHPK3PXP', 'chave-forte');
    expect(sealed.startsWith('enc1:')).toBe(true);
    expect(sealed).not.toContain('JBSWY3DPEHPK3PXP');
    expect(openSecret(sealed, 'chave-forte')).toBe('JBSWY3DPEHPK3PXP');
    expect(openSecret(sealed, 'outra-chave')).toBeNull();
    expect(openSecret(sealed, undefined)).toBeNull();
    expect(openSecret(sealSecret('JBSWY3DPEHPK3PXP'), undefined)).toBe('JBSWY3DPEHPK3PXP');
  });
});
