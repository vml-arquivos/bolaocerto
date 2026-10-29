import { legalDocument, LEGAL_VERSION } from '../legal/documents';
import { ConflictException } from '@nestjs/common';
import { SharesService } from './shares.service';

function serializedTransaction(tx: any) {
  let queue = Promise.resolve();
  return jest.fn(async (callback: (client: any) => Promise<unknown>) => {
    const previous = queue;
    let release!: () => void;
    queue = new Promise<void>((resolve) => { release = resolve; });
    await previous;
    try { return await callback(tx); } finally { release(); }
  });
}

describe('SharesService stock safety', () => {
  const originalEnv = { ...process.env };
  const originalPayments = process.env.PAYMENTS_ENABLED;
  const originalMandate = process.env.MANDATO_TERM_HASH;

  beforeEach(() => {
    process.env.PAYMENTS_ENABLED = 'true';
    Object.assign(process.env, { LEGAL_APPROVED_VERSION: LEGAL_VERSION, LEGAL_OPERATOR_NAME: 'Fixture', LEGAL_OPERATOR_CNPJ: '00000000000100', LEGAL_OPERATOR_ADDRESS: 'Fixture', LEGAL_CONTACT_EMAIL: 'test@example.invalid', LEGAL_REFUND_TERMS: 'Fixture', LEGAL_AFFILIATE_PAYOUT_TERMS: 'Fixture' });
  });

  afterAll(() => {
    process.env = originalEnv;
    process.env.PAYMENTS_ENABLED = originalPayments;
    process.env.MANDATO_TERM_HASH = originalMandate;
  });

  it('allows only one of two simultaneous reservations for the last share', async () => {
    const pool = { id: 'pool-1', status: 'aberto', valorCota: '6.00', taxaAdministracaoPct: '10.00', cotasVendidas: 0, totalCotas: 1 };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      concurso: { findUniqueOrThrow: jest.fn().mockResolvedValue({ cutoffAt: new Date(Date.now() + 86400000) }) },
      bolao: {
        findUnique: jest.fn().mockImplementation(async () => pool),
        update: jest.fn().mockImplementation(async ({ data }: any) => { pool.cotasVendidas += data.cotasVendidas.increment; return pool; }),
      },
      cota: { create: jest.fn().mockResolvedValue({ id: 'share-1', bolaoId: 'pool-1', status: 'reservada', quantidade: 1, expiraReservaEm: new Date() }) },
    };
    const prisma = { afiliado: { findFirst: jest.fn().mockResolvedValue(null) }, $transaction: serializedTransaction(tx) };
    const service = new SharesService(prisma as any, { record: jest.fn() } as any);
    const dto = { bolaoId: 'pool-1', titularCpf: '52998224725', titularNome: 'Pessoa', quantidade: 1, termoMandatoHash: legalDocument('participacao').hash, aceitoTermos: true };
    const results = await Promise.allSettled([
      service.reserve(dto as any, { id: 'user-1', papel: 'cotista' } as any, { ip: '127.0.0.1' }),
      service.reserve(dto as any, { id: 'user-2', papel: 'cotista' } as any, { ip: '127.0.0.2' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected' && result.reason instanceof ConflictException)).toHaveLength(1);
    expect(pool.cotasVendidas).toBe(1);
  });

  it('allows multiple simultaneous reservations for an unlimited pool', async () => {
    const pool = { id: 'pool-unlimited', status: 'aberto', valorCota: '6.00', taxaAdministracaoPct: '10.00', cotasVendidas: 0, totalCotas: null, cotasIlimitadas: true };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      concurso: { findUniqueOrThrow: jest.fn().mockResolvedValue({ cutoffAt: new Date(Date.now() + 86400000) }) },
      bolao: {
        findUnique: jest.fn().mockImplementation(async () => pool),
        update: jest.fn().mockImplementation(async ({ data }: any) => { pool.cotasVendidas += data.cotasVendidas.increment; return pool; }),
      },
      cota: { create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: `share-${data.compradorId}`, bolaoId: pool.id, status: 'reservada', quantidade: data.quantidade, expiraReservaEm: new Date() })) },
    };
    const prisma = { afiliado: { findFirst: jest.fn().mockResolvedValue(null) }, $transaction: serializedTransaction(tx) };
    const service = new SharesService(prisma as any, { record: jest.fn() } as any);
    const dto = { bolaoId: pool.id, titularCpf: '52998224725', titularNome: 'Pessoa', quantidade: 1, termoMandatoHash: legalDocument('participacao').hash, aceitoTermos: true };
    const results = await Promise.all([
      service.reserve(dto as any, { id: 'user-1', papel: 'cotista' } as any, { ip: '127.0.0.1' }),
      service.reserve(dto as any, { id: 'user-2', papel: 'cotista' } as any, { ip: '127.0.0.2' }),
    ]);
    expect(results).toHaveLength(2);
    expect(pool.cotasVendidas).toBe(2);
  });
  it('bloqueia reservas de bolão condicional até o prêmio atingir o gatilho e libera depois', async () => {
    const pool: any = { id: 'pool-cond', concursoId: 'c1', status: 'aberto', valorCota: '6.00', taxaAdministracaoPct: '10.00', cotasVendidas: 0, totalCotas: 10, cotasIlimitadas: false, premioMinimoLiberacao: '100000000.00', liberadoEm: null };
    let estimate: string | null = '80000000.00';
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      bolao: {
        findUnique: jest.fn().mockImplementation(async () => pool),
        update: jest.fn().mockImplementation(async ({ data }: any) => { if (data.liberadoEm) pool.liberadoEm = data.liberadoEm; if (data.cotasVendidas) pool.cotasVendidas += data.cotasVendidas.increment; return pool; }),
      },
      concurso: { findUniqueOrThrow: jest.fn().mockResolvedValue({ cutoffAt: new Date(Date.now() + 86400000) }), findUnique: jest.fn().mockImplementation(async () => ({ valorEstimadoPremio: estimate })) },
      cota: { create: jest.fn().mockResolvedValue({ id: 'share-c', bolaoId: 'pool-cond', status: 'reservada', quantidade: 1, expiraReservaEm: new Date() }) },
    };
    const prisma = { afiliado: { findFirst: jest.fn() }, $transaction: serializedTransaction(tx) };
    const service = new SharesService(prisma as any, { record: jest.fn() } as any);
    const dto = { bolaoId: 'pool-cond', titularCpf: '52998224725', titularNome: 'Pessoa', quantidade: 1, termoMandatoHash: legalDocument('participacao').hash, aceitoTermos: true };
    await expect(service.reserve(dto as any, { id: 'u1', papel: 'cotista' } as any, { ip: '1' })).rejects.toThrow(/ainda não liberadas/);
    expect(tx.cota.create).not.toHaveBeenCalled();
    estimate = '100000000.00';
    await expect(service.reserve(dto as any, { id: 'u1', papel: 'cotista' } as any, { ip: '1' })).resolves.toMatchObject({ id: 'share-c' });
    expect(pool.liberadoEm).toBeInstanceOf(Date);
    estimate = '70000000.00'; // oscilou para baixo: continua liberado
    await expect(service.reserve(dto as any, { id: 'u2', papel: 'cotista' } as any, { ip: '2' })).resolves.toMatchObject({ id: 'share-c' });
  });
});
