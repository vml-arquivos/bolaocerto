import { createHash } from 'node:crypto';
import { approvedDocument, legalDocument, LEGAL_VERSION } from './documents';
describe('Contract evidence', () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; });
  it('is a draft and blocks contracting without operator configuration', () => {
    delete process.env.LEGAL_APPROVED_VERSION;
    expect(legalDocument('participacao').aprovado).toBe(false);
    expect(() => approvedDocument('participacao')).toThrow(/revisão/);
  });
  it('hashes the exact delivered UTF-8 text and changes when a commission changes', () => {
    const doc = legalDocument('afiliado', '10.00');
    expect(doc.hash).toBe(createHash('sha256').update(doc.texto, 'utf8').digest('hex'));
    expect(legalDocument('afiliado', '15.00').hash).not.toBe(doc.hash);
  });
  it('includes the individual commission in a custom affiliate contract too', () => {
    process.env.LEGAL_AFILIADO_TEXT = 'Custom reviewed agreement';
    expect(legalDocument('afiliado', '10.00').hash).not.toBe(legalDocument('afiliado', '15.00').hash);
    expect(legalDocument('afiliado', '10.00').texto).toContain('10.00%');
  });
  it('requires identity and operational terms even if review flag is set', () => {
    process.env.LEGAL_APPROVED_VERSION = LEGAL_VERSION;
    delete process.env.LEGAL_CONTACT_EMAIL;
    expect(() => approvedDocument('privacidade')).toThrow();
  });
  it('does not present the internal receipt as a Caixa receipt', () => {
    expect(legalDocument('participacao').texto).toContain('não substitui o bilhete oficial');
  });
});
