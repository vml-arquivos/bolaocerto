import { Prisma, StatusCota } from '@prisma/client';
import { AuthUser } from '../auth/auth.utils';
import { buildFunnel, classify, DEFAULT_CRM_CONFIG, EMPTY_METRICS, etapaFunil, levelFor } from './crm.segments';
import { CrmService } from './crm.service';

const NOW = new Date('2026-10-18T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const admin = { id: 'admin-1', email: 'admin@bl.com', papel: 'admin' } as AuthUser;

describe('segmentação do CRM', () => {
  it('define o nível pelo total investido', () => {
    expect(levelFor(0)).toBe('sem_compra');
    expect(levelFor(50)).toBe('bronze');
    expect(levelFor(1000)).toBe('prata');
    expect(levelFor(5000)).toBe('ouro');
    expect(levelFor(20000)).toBe('diamante');
  });

  it('apostador maior é VIP e pode estar inativo ao mesmo tempo (para reativação)', () => {
    const { nivel, segmentos } = classify({ ...EMPTY_METRICS, totalGasto: 6000, compras: 8, boloesDistintos: 5, cotasPagas: 40, primeiraCompraEm: daysAgo(400), ultimaCompraEm: daysAgo(120) }, [], NOW);
    expect(nivel).toBe('ouro');
    expect(segmentos).toEqual(expect.arrayContaining(['vip', 'inativo', 'recorrente']));
    expect(segmentos).not.toContain('novo');
  });

  it('quem nunca comprou é "sem_compra"; quem tem reserva vencida é "inadimplente"', () => {
    expect(classify(EMPTY_METRICS, [], NOW).segmentos).toEqual(['sem_compra']);
    expect(classify({ ...EMPTY_METRICS, reservasVencidas: 1, cotasPendentes: 2 }, [], NOW).segmentos).toEqual(expect.arrayContaining(['sem_compra', 'inadimplente']));
  });

  it('etiqueta manual "vip" promove o apostador e compra recente é "novo"', () => {
    const { segmentos } = classify({ ...EMPTY_METRICS, totalGasto: 30, compras: 1, boloesDistintos: 1, cotasPagas: 1, primeiraCompraEm: daysAgo(3), ultimaCompraEm: daysAgo(3) }, ['vip'], NOW, DEFAULT_CRM_CONFIG);
    expect(segmentos).toEqual(expect.arrayContaining(['vip', 'novo']));
  });
});

function build() {
  const users = [
    { id: 'u1', nome: 'Ana Grande', cpf: '12345678909', email: 'ana@x.com', telefone: '61999990000', enderecoCidade: 'Brasília', enderecoUf: 'DF', papel: 'cotista', criadoEm: daysAgo(500), indicadoPorAfiliado: { codigoAfiliado: 'AF1' }, crmPerfil: null },
    { id: 'u2', nome: 'Bruno Pequeno', cpf: '98765432100', email: 'bruno@x.com', telefone: null, enderecoCidade: null, enderecoUf: null, papel: 'cotista', criadoEm: daysAgo(10), indicadoPorAfiliado: null, crmPerfil: null },
  ];
  const paid = [
    ...Array.from({ length: 4 }, (_, index) => ({ compradorId: 'u1', bolaoId: `b${index}`, quantidade: 10, valorPago: new Prisma.Decimal(300), criadoEm: daysAgo(30 + index), status: StatusCota.paga, valorPremio: null, pagamento: { valorBruto: new Prisma.Decimal(300), confirmadoEm: daysAgo(30 + index) } })),
    { compradorId: 'u2', bolaoId: 'b1', quantidade: 1, valorPago: new Prisma.Decimal(25), criadoEm: daysAgo(2), status: StatusCota.paga, valorPremio: null, pagamento: { valorBruto: new Prisma.Decimal(25), confirmadoEm: daysAgo(2) } },
  ];
  const pending = [{ compradorId: 'u2', quantidade: 2, expiraReservaEm: daysAgo(1), bolao: { valorCota: new Prisma.Decimal(25) } }];
  const prisma = {
    usuario: { findMany: jest.fn().mockResolvedValue(users), findUnique: jest.fn().mockResolvedValue({ id: 'u1' }) },
    cota: { findMany: jest.fn().mockImplementation(async ({ where }: any) => (where.status === StatusCota.reservada ? pending : paid)), groupBy: jest.fn().mockResolvedValue([]) },
    crmNota: { create: jest.fn().mockResolvedValue({ id: 'n1', texto: 'Ligar', criadoEm: NOW }) },
    crmPerfil: { upsert: jest.fn().mockImplementation(async ({ create }: any) => ({ etiquetas: create.etiquetas ?? [], proximoContatoEm: create.proximoContatoEm ?? null })) },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  return { service: new CrmService(prisma as never, audit as never), prisma, audit };
}

describe('CrmService', () => {
  beforeAll(() => { jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] }); });
  afterAll(() => { jest.useRealTimers(); });

  it('lista ordenando pelos maiores apostadores e mascara o CPF', async () => {
    const { service } = build();
    const result = await service.list({}, admin) as { items: Array<Record<string, any>>; total: number };
    expect(result.total).toBe(2);
    expect(result.items[0]).toMatchObject({ nome: 'Ana Grande', totalGasto: 1200, cotasPagas: 40, boloesDistintos: 4, nivel: 'prata', cpf: '123.456.789-09' });
    expect(result.items[0]!.segmentos).toEqual(expect.arrayContaining(['vip', 'recorrente']));
    expect(result.items[1]).toMatchObject({ nome: 'Bruno Pequeno', valorPendente: 50, reservasVencidas: 1 });
    expect(result.items[1]!.segmentos).toEqual(expect.arrayContaining(['novo', 'inadimplente']));
    expect(result.items[0]).toMatchObject({ etapa: 'recorrente' });
    expect(result.items[1]).toMatchObject({ etapa: 'pagou' });
  });

  it('filtra por etapa do funil e traz o resumo do funil na visão geral', async () => {
    const { service } = build();
    const rec = await service.list({ etapa: 'recorrente' }, admin) as { items: Array<{ nome: string }> };
    expect(rec.items.map((item) => item.nome)).toEqual(['Ana Grande']);
    const overview = await service.overview();
    expect(overview.funil.totais).toMatchObject({ cadastrados: 2, jaPagaram: 2 });
  });

  it('filtra por segmento e por busca', async () => {
    const { service } = build();
    const vip = await service.list({ segmento: 'vip' }, admin) as { items: Array<{ nome: string }> };
    expect(vip.items.map((item) => item.nome)).toEqual(['Ana Grande']);
    const search = await service.list({ busca: 'bruno' }, admin) as { items: Array<{ nome: string }> };
    expect(search.items).toHaveLength(1);
  });

  it('exporta CSV com CPF completo e registra auditoria; PDF e XLSX são arquivos válidos', async () => {
    const { service, audit } = build();
    const csv = await service.list({ formato: 'csv' }, admin) as { buffer: Buffer; contentType: string };
    expect(csv.contentType).toContain('text/csv');
    expect(csv.buffer.toString('utf8')).toContain('123.456.789-09');
    const pdf = await service.list({ formato: 'pdf' }, admin) as { buffer: Buffer };
    expect(pdf.buffer.subarray(0, 5).toString()).toBe('%PDF-');
    expect(pdf.buffer.toString('latin1')).not.toContain('123.456.789-09');
    const xlsx = await service.list({ formato: 'xlsx' }, admin) as { buffer: Buffer };
    expect(xlsx.buffer.subarray(0, 2).toString()).toBe('PK');
    expect(audit.record).toHaveBeenCalledTimes(3);
  });

  it('visão geral: ranking, níveis e receita VIP', async () => {
    const { service } = build();
    const overview = await service.overview();
    expect(overview.totais).toMatchObject({ cadastrados: 2, compradores: 2, receitaTotal: 1225 });
    expect(overview.maioresApostadores[0]).toMatchObject({ nome: 'Ana Grande' });
    expect(overview.niveis.find((tier) => tier.nivel === 'prata')?.apostadores).toBe(1);
  });

  it('salva nota e normaliza etiquetas', async () => {
    const { service, prisma } = build();
    await service.addNote('u1', { texto: '  Ligar na segunda  ' }, admin);
    expect(prisma.crmNota.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ texto: 'Ligar na segunda', autorId: 'admin-1' }) }));
    const profile = await service.updateProfile('u1', { etiquetas: [' VIP ', 'vip', 'Bolão Grande'] }, admin);
    expect(profile.etiquetas).toEqual(['vip', 'bolão grande']);
  });
});

describe('esteira de venda (funil)', () => {
  it('coloca cada cliente na etapa certa', () => {
    expect(etapaFunil(EMPTY_METRICS, NOW)).toBe('cadastrado');
    expect(etapaFunil({ ...EMPTY_METRICS, cotasPendentes: 1 }, NOW)).toBe('reservou');
    expect(etapaFunil({ ...EMPTY_METRICS, cotasPendentes: 1, reservasVencidas: 1 }, NOW)).toBe('reserva_vencida');
    expect(etapaFunil({ ...EMPTY_METRICS, reservasCanceladas: 2 }, NOW)).toBe('reserva_vencida');
    expect(etapaFunil({ ...EMPTY_METRICS, compras: 1, boloesDistintos: 1, totalGasto: 30, ultimaCompraEm: daysAgo(5) }, NOW)).toBe('pagou');
    expect(etapaFunil({ ...EMPTY_METRICS, compras: 4, boloesDistintos: 3, totalGasto: 300, ultimaCompraEm: daysAgo(5) }, NOW)).toBe('recorrente');
    expect(etapaFunil({ ...EMPTY_METRICS, compras: 4, boloesDistintos: 3, totalGasto: 300, ultimaCompraEm: daysAgo(200) }, NOW)).toBe('inativo');
  });

  it('resume o funil com as taxas de avanço', () => {
    const base = { compras: 0, cotasPendentes: 0, reservasVencidas: 0 };
    const funnel = buildFunnel([
      { ...base, etapa: 'cadastrado' }, { ...base, etapa: 'cadastrado' },
      { ...base, etapa: 'reservou', cotasPendentes: 1 }, { ...base, etapa: 'pagou', compras: 1 },
    ]);
    expect(funnel.totais).toMatchObject({ cadastrados: 4, jaReservaram: 2, jaPagaram: 1, reservaramPct: 50, pagaramPct: 25, pagaramDeReservaramPct: 50 });
    expect(funnel.etapas.find((stage) => stage.chave === 'cadastrado')?.clientes).toBe(2);
    expect(funnel.etapas).toHaveLength(6);
  });
});
