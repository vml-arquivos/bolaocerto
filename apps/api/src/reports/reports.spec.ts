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
