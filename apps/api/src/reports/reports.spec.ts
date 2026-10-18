import { Prisma, StatusComissao, StatusCota, StatusPagamento } from '@prisma/client';
import { AuthUser } from '../auth/auth.utils';
import { buildCsv, buildXlsx, maskCpf, sanitizeCell } from './export.util';
import { ReportsService } from './reports.service';

const admin = { id: 'admin-1', papel: 'admin' } as AuthUser;

function share(overrides: Record<string, unknown> = {}) {
  return {
    id: 'cota-1', bolaoId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', compradorId: 'u1', titularNome: 'Maria Souza', titularCpf: '12345678909', quantidade: 2,
    status: StatusCota.paga, expiraReservaEm: null, origemVenda: 'online', criadoEm: new Date('2026-10-01T15:00:00Z'),
    bolao: { valorCota: new Prisma.Decimal(25), concurso: { modalidade: 'megasena', numeroConcurso: 2900, dataSorteio: new Date('2026-10-10T23:00:00Z') }, grupo: { nome: 'Grupo A' } },
    comprador: { email: 'maria@x.com', telefone: '61999990000' },
    pagamento: { status: StatusPagamento.confirmado, metodo: 'pix', valorBruto: new Prisma.Decimal(50), valorCustoBilhete: new Prisma.Decimal(37.04), valorTaxaAdmin: new Prisma.Decimal(12.96), confirmadoEm: new Date('2026-10-01T15:05:00Z'), vencimentoEm: null, observacao: null },
    afiliadoReferencia: { codigoAfiliado: 'AF123' },
    comissao: { valor: new Prisma.Decimal(1.3), status: StatusComissao.pendente },
    ...overrides,
  };
}

function service(shares: unknown[]) {
  const prisma = { cota: { findMany: jest.fn().mockResolvedValue(shares) } };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return { reports: new ReportsService(prisma as never, audit as never), prisma, audit };
}

describe('export.util', () => {
  it('gera CSV com BOM, separador ; e escapa aspas e quebras de linha', () => {
    const csv = buildCsv([{ key: 'a', header: 'Nome' }, { key: 'b', header: 'Valor', type: 'money' }], [{ a: 'Ana; "Bia"', b: 1234.5 }]).toString('utf8');
    expect(csv.startsWith('\uFEFFNome;Valor')).toBe(true);
    expect(csv).toContain('"Ana; ""Bia""";1234,50');
  });

  it('neutraliza injeção de fórmula em planilhas', () => {
    expect(sanitizeCell('=HYPERLINK("x")')).toBe(`'=HYPERLINK("x")`);
    expect(sanitizeCell('Maria')).toBe('Maria');
  });

  it('mascara CPF e gera XLSX válido (zip)', async () => {
    expect(maskCpf('12345678909')).toBe('***.***.789-09');
    const xlsx = await buildXlsx([{ name: 'Teste', columns: [{ key: 'a', header: 'A' }], rows: [{ a: 1 }] }], 'teste');
    expect(xlsx.subarray(0, 2).toString()).toBe('PK');
  });
});

describe('ReportsService.sales', () => {
  it('JSON mascara o CPF e traz status, comissão e valores', async () => {
    const { reports, audit } = service([share()]);
    const result = await reports.sales({}, admin) as { linhas: Array<Record<string, unknown>> };
    expect(result.linhas[0]).toMatchObject({ cpf: '***.***.789-09', valorTotal: 50, statusPagamento: 'confirmado', afiliado: 'AF123', comissao: 1.3, statusComissao: 'pendente' });
    expect(audit.record).not.toHaveBeenCalled();
  });

  it('CSV exporta CPF completo e registra auditoria da exportação', async () => {
    const { reports, audit } = service([share()]);
    const file = await reports.sales({ formato: 'csv' }, admin) as { filename: string; buffer: Buffer };
    expect(file.filename).toMatch(/^vendas-bolao-livre-\d{4}-\d{2}-\d{2}\.csv$/);
    expect(file.buffer.toString('utf8')).toContain('123.456.789-09');
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ evento: 'relatorio.exportado', atorId: 'admin-1' }));
  });

  it('marca como vencida a reserva expirada ainda não paga', async () => {
    const { reports } = service([share({ status: StatusCota.reservada, expiraReservaEm: new Date('2020-01-01'), pagamento: null, comissao: null })]);
    const result = await reports.sales({}, admin) as { linhas: Array<Record<string, unknown>> };
    expect(result.linhas[0]).toMatchObject({ statusCota: 'reservada (vencida)', statusPagamento: 'sem cobrança', valorTotal: 50 });
  });

  it('rejeita período invertido', async () => {
    const { reports } = service([]);
    await expect(reports.sales({ de: '2026-10-10', ate: '2026-10-01' }, admin)).rejects.toThrow('data inicial');
  });
});

function paymentRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'pay-1', criadoEm: new Date('2026-10-01T15:00:00Z'), confirmadoEm: new Date('2026-10-01T15:05:00Z'), metodo: 'pix', pspProvedor: 'cora', pspTransactionId: 'inv_1', origem: 'gateway', formaBaixa: null,
    status: StatusPagamento.confirmado, valorBruto: new Prisma.Decimal(100), valorCustoBilhete: new Prisma.Decimal(74.07), valorTaxaAdmin: new Prisma.Decimal(25.93), vencimentoEm: null, observacao: null, notaFiscal: null,
    cota: { titularNome: 'Maria Souza', titularCpf: '12345678909', quantidade: 2, bolaoId: 'aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee', status: StatusCota.paga, comprador: { email: 'maria@x.com' }, bolao: { concurso: { modalidade: 'megasena', numeroConcurso: 2900 } }, comissao: { valor: new Prisma.Decimal(2.59), status: StatusComissao.pendente } },
    ...overrides,
  };
}

describe('ReportsService.payments (conciliação)', () => {
  it('decompõe custo, taxa, comissão e resultado; mascara o CPF no JSON', async () => {
    const prisma = { pagamento: { findMany: jest.fn().mockResolvedValue([paymentRow()]) } };
    const reports = new ReportsService(prisma as never, { record: jest.fn() } as never);
    const result = await reports.payments({}, admin) as { linhas: Array<Record<string, unknown>> };
    expect(result.linhas[0]).toEqual(expect.objectContaining({ cpf: '***.***.789-09', valorBruto: 100, taxaAdmin: 25.93, comissao: 2.59, resultadoPlataforma: 23.34, notaFiscal: 'sem nota', provedor: 'cora' }));
  });

  it('pagamento pendente não conta custo, taxa nem resultado; comissão cancelada não abate', async () => {
    const pending = paymentRow({ status: StatusPagamento.pendente, confirmadoEm: null });
    const cancelled = paymentRow({ cota: { ...paymentRow().cota, comissao: { valor: new Prisma.Decimal(2.59), status: StatusComissao.cancelada } } });
    const prisma = { pagamento: { findMany: jest.fn().mockResolvedValue([pending, cancelled]) } };
    const result = await new ReportsService(prisma as never, { record: jest.fn() } as never).payments({}, admin) as { linhas: Array<Record<string, unknown>> };
    expect(result.linhas[0]).toEqual(expect.objectContaining({ taxaAdmin: null, resultadoPlataforma: null, notaFiscal: null }));
    expect(result.linhas[1]).toEqual(expect.objectContaining({ comissao: 0, resultadoPlataforma: 25.93 }));
  });

  it('exporta XLSX com CPF completo e registra auditoria', async () => {
    const prisma = { pagamento: { findMany: jest.fn().mockResolvedValue([paymentRow()]) } };
    const audit = { record: jest.fn().mockResolvedValue(undefined) };
    const file = await new ReportsService(prisma as never, audit as never).payments({ formato: 'xlsx' }, admin) as { filename: string; buffer: Buffer };
    expect(file.filename).toMatch(/^pagamentos-bolao-livre-\d{4}-\d{2}-\d{2}\.xlsx$/);
    expect(file.buffer.subarray(0, 2).toString()).toBe('PK');
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ evento: 'relatorio.exportado' }));
  });
});

describe('ReportsService.invoices (notas fiscais)', () => {
  const note = (overrides: Record<string, unknown> = {}) => ({
    criadoEm: new Date('2026-10-02T12:00:00Z'), emitidaEm: new Date('2026-10-02T12:05:00Z'), status: 'emitida', origem: 'cora', numero: '123', provedorId: 'nfse_abcd1234', pdfUrl: 'https://x/p.pdf', erro: null, observacao: null,
    valor: new Prisma.Decimal(100), issPct: new Prisma.Decimal(5), pagamento: { valorTaxaAdmin: new Prisma.Decimal(25.93), pspTransactionId: 'inv_1', cota: paymentRow().cota },
    ...overrides,
  });

  it('calcula o ISS estimado e informa pagamentos sem nota', async () => {
    const prisma = { notaFiscal: { findMany: jest.fn().mockResolvedValue([note()]) }, pagamento: { count: jest.fn().mockResolvedValue(4) } };
    const result = await new ReportsService(prisma as never, { record: jest.fn() } as never).invoices({}, admin) as { linhas: Array<Record<string, unknown>>; pagamentosSemNota: number };
    expect(result.linhas[0]).toEqual(expect.objectContaining({ valorNota: 100, issPct: 5, issEstimado: 5, numero: '123', cpf: '***.***.789-09' }));
    expect(result.pagamentosSemNota).toBe(4);
  });

  it('filtra por situação da nota', async () => {
    const findMany = jest.fn().mockResolvedValue([]);
    const prisma = { notaFiscal: { findMany }, pagamento: { count: jest.fn().mockResolvedValue(0) } };
    await new ReportsService(prisma as never, { record: jest.fn() } as never).invoices({ statusNota: 'erro' }, admin);
    expect(findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'erro' }) }));
  });
});
