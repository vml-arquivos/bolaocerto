import { Prisma } from '@prisma/client';
import { buildReceiptData, buildReceiptPdf, receiptCode, receiptCodeMatches, ReceiptSource } from './receipt';
import { computeShareAmounts } from '../payments/payments.service';

function source(overrides: Partial<ReceiptSource> = {}): ReceiptSource {
  const amounts = computeShareAmounts(25, 3, 10, 20);
  return {
    id: '123e4567-e89b-12d3-a456-426614174000', titularNome: 'Maria Souza', titularCpf: '12345678909', quantidade: 3, comprador: { email: 'maria@x.com' },
    bolao: { id: 'b1', valorCota: new Prisma.Decimal(25), totalCotas: 20, cotasIlimitadas: false, taxaAdministracaoPct: new Prisma.Decimal(10), grupo: { nome: 'Grupo A' }, concurso: { modalidade: 'megasena', numeroConcurso: 2900, dataSorteio: new Date('2026-10-10T23:00:00Z') }, jogos: [{ ordem: 1, numeros: [4, 12, 23, 35, 44, 58] }] },
    pagamento: { id: 'p1', metodo: 'pix', valorBruto: new Prisma.Decimal(amounts.gross), valorTaxaAdmin: new Prisma.Decimal(amounts.adminFee), valorCustoBilhete: new Prisma.Decimal(amounts.cost), valorComissaoAfiliado: new Prisma.Decimal(amounts.affiliateCommission), confirmadoEm: new Date('2026-10-02T12:00:00Z'), pspTransactionId: 'inv_123', origem: 'gateway', notaFiscal: null },
    comissao: { valor: new Prisma.Decimal(amounts.affiliateCommission), percentual: new Prisma.Decimal(20), status: 'pendente' },
    afiliadoReferencia: { codigoAfiliado: 'AF123' },
    mandato: { aceitoEm: new Date('2026-10-02T11:55:00Z'), textoHash: 'abc123' },
    ...overrides,
  };
}

describe('recibo do participante', () => {
  it('a decomposição fecha: apostas + taxa = total; plataforma = taxa − comissão', () => {
    const data = buildReceiptData(source());
    const v = data.valores;
    expect(v.valorPago).toBe(75);
    expect(Math.round((v.aplicadoNasApostas + v.taxaAdministracao) * 100)).toBe(7500);
    expect(Math.round((v.fiqueiPlataforma + v.comissaoAfiliado) * 100)).toBe(Math.round(v.taxaAdministracao * 100));
    expect(v.comissaoAfiliado).toBeGreaterThan(0);
    expect(data.participante.cpf).toBe('***.***.789-09');
    expect(data.explicacoes.map((item) => item.titulo)).toEqual(expect.arrayContaining(['Quanto vai para as apostas', 'Quanto fica com a plataforma']));
  });

  it('sem afiliado não há comissão e tudo da taxa fica com a plataforma', () => {
    const data = buildReceiptData(source({ comissao: null, afiliadoReferencia: null, pagamento: { ...source().pagamento, valorComissaoAfiliado: new Prisma.Decimal(0) } }));
    expect(data.valores.comissaoAfiliado).toBe(0);
    expect(data.valores.fiqueiPlataforma).toBe(data.valores.taxaAdministracao);
  });

  it('comissão cancelada não é contada', () => {
    const data = buildReceiptData(source({ comissao: { valor: new Prisma.Decimal(1), percentual: null, status: 'cancelada' }, pagamento: { ...source().pagamento, valorComissaoAfiliado: new Prisma.Decimal(0) } }));
    expect(data.valores.comissaoAfiliado).toBe(0);
  });

  it('código de verificação é estável, sensível ao valor e comparado em tempo constante', () => {
    const code = receiptCode('c1', 'p1', '75.00');
    expect(code).toMatch(/^[0-9A-F]{4}(-[0-9A-F]{4}){3}$/);
    expect(receiptCodeMatches(code, code.toLowerCase())).toBe(true);
    expect(receiptCodeMatches(code, receiptCode('c1', 'p1', '76.00'))).toBe(false);
    expect(receiptCodeMatches(code, 'x')).toBe(false);
  });

  it('gera um PDF válido', async () => {
    const pdf = await buildReceiptPdf(buildReceiptData(source()), 'https://exemplo.com/verificar');
    expect(pdf.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.length).toBeGreaterThan(2000);
  });
});
