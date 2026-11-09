import { createHash } from 'node:crypto';
import { approvedDocument, documentSource, legalDocument, LEGAL_CATALOG, LEGAL_KINDS, LEGAL_VERSION, setPublishedDocuments } from './documents';
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

describe('Documentos publicados pelo painel', () => {
  const original = { ...process.env };
  afterEach(() => { process.env = { ...original }; setPublishedDocuments({}); });

  it('cobre termos, privacidade, contratos de cliente e afiliado, parceiro e funcionário', () => {
    expect(LEGAL_CATALOG.map((entry) => entry.tipo)).toEqual(['termos', 'privacidade', 'participacao', 'afiliado', 'parceiro', 'funcionario']);
    for (const kind of LEGAL_KINDS) expect(legalDocument(kind).texto.length).toBeGreaterThan(200);
    expect(legalDocument('parceiro').texto).toContain('CONTRATO DE PARCERIA');
    expect(legalDocument('funcionario').texto).toContain('EQUIPE');
  });

  it('o texto publicado pelo painel vale no lugar da minuta e da variável, com versão e hash próprios', () => {
    process.env.LEGAL_TERMOS_TEXT = 'Texto vindo da variável';
    expect(documentSource('termos')).toBe('ambiente');
    const before = legalDocument('termos');
    setPublishedDocuments({ termos: { texto: 'TERMOS DEFINITIVOS publicados no painel', versao: '2026-11-09.1' } });
    const after = legalDocument('termos');
    expect(documentSource('termos')).toBe('painel');
    expect(after.texto).toBe('TERMOS DEFINITIVOS publicados no painel');
    expect(after.versao).toBe('2026-11-09.1');
    expect(after.hash).not.toBe(before.hash);
    expect(after.hash).toBe(createHash('sha256').update(after.texto, 'utf8').digest('hex'));
  });

  it('sem publicação, a minuta provisória continua valendo (nada muda para quem já usa o sistema)', () => {
    expect(documentSource('privacidade')).toBe('minuta');
    expect(legalDocument('privacidade').versao).toBe(LEGAL_VERSION);
  });

  it('o contrato de afiliado publicado pelo painel continua levando a comissão de cada afiliado', () => {
    setPublishedDocuments({ afiliado: { texto: 'CONTRATO DE AFILIADO DEFINITIVO', versao: '2026-11-09.1' } });
    expect(legalDocument('afiliado', '12.50').texto).toContain('12.50%');
    expect(legalDocument('afiliado', '12.50').hash).not.toBe(legalDocument('afiliado', '10.00').hash);
  });

  it('a liberação para contratar continua dependendo da configuração do operador, mesmo com texto publicado', () => {
    delete process.env.LEGAL_APPROVED_VERSION;
    setPublishedDocuments({ participacao: { texto: 'CONTRATO DEFINITIVO', versao: '2026-11-09.1' } });
    expect(legalDocument('participacao').aprovado).toBe(false);
    expect(() => approvedDocument('participacao')).toThrow(/revisão/);
  });
});
