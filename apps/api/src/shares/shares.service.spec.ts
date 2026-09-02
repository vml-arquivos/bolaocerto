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
  const originalPayments = process.env.PAYMENTS_ENABLED;
  const originalMandate = process.env.MANDATO_TERM_HASH;

  beforeEach(() => {
    process.env.PAYMENTS_ENABLED = 'true';
    process.env.MANDATO_TERM_HASH = 'hash';
  });

  afterAll(() => {
    process.env.PAYMENTS_ENABLED = originalPayments;
    process.env.MANDATO_TERM_HASH = originalMandate;
  });

  it('allows only one of two simultaneous reservations for the last share', async () => {
    const pool = { id: 'pool-1', status: 'aberto', cotasVendidas: 0, totalCotas: 1 };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      bolao: {
        findUnique: jest.fn().mockImplementation(async () => pool),
        update: jest.fn().mockImplementation(async ({ data }: any) => { pool.cotasVendidas += data.cotasVendidas.increment; return pool; }),
      },
      cota: { create: jest.fn().mockResolvedValue({ id: 'share-1', bolaoId: 'pool-1', status: 'reservada', quantidade: 1, expiraReservaEm: new Date() }) },
    };
    const prisma = { afiliado: { findFirst: jest.fn().mockResolvedValue(null) }, $transaction: serializedTransaction(tx) };
    const service = new SharesService(prisma as any, { record: jest.fn() } as any);
    const dto = { bolaoId: 'pool-1', titularCpf: '52998224725', titularNome: 'Pessoa', quantidade: 1, termoMandatoHash: 'hash' };
    const results = await Promise.allSettled([
      service.reserve(dto as any, { id: 'user-1', papel: 'cotista' } as any, { ip: '127.0.0.1' }),
      service.reserve(dto as any, { id: 'user-2', papel: 'cotista' } as any, { ip: '127.0.0.2' }),
    ]);
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(results.filter((result) => result.status === 'rejected' && result.reason instanceof ConflictException)).toHaveLength(1);
    expect(pool.cotasVendidas).toBe(1);
  });

  it('allows multiple simultaneous reservations for an unlimited pool', async () => {
    const pool = { id: 'pool-unlimited', status: 'aberto', cotasVendidas: 0, totalCotas: null, cotasIlimitadas: true };
    const tx = {
      $queryRaw: jest.fn().mockResolvedValue([]),
      bolao: {
        findUnique: jest.fn().mockImplementation(async () => pool),
        update: jest.fn().mockImplementation(async ({ data }: any) => { pool.cotasVendidas += data.cotasVendidas.increment; return pool; }),
      },
      cota: { create: jest.fn().mockImplementation(async ({ data }: any) => ({ id: `share-${data.compradorId}`, bolaoId: pool.id, status: 'reservada', quantidade: data.quantidade, expiraReservaEm: new Date() })) },
    };
    const prisma = { afiliado: { findFirst: jest.fn().mockResolvedValue(null) }, $transaction: serializedTransaction(tx) };
    const service = new SharesService(prisma as any, { record: jest.fn() } as any);
    const dto = { bolaoId: pool.id, titularCpf: '52998224725', titularNome: 'Pessoa', quantidade: 1, termoMandatoHash: 'hash' };
    const results = await Promise.all([
      service.reserve(dto as any, { id: 'user-1', papel: 'cotista' } as any, { ip: '127.0.0.1' }),
      service.reserve(dto as any, { id: 'user-2', papel: 'cotista' } as any, { ip: '127.0.0.2' }),
    ]);
    expect(results).toHaveLength(2);
    expect(pool.cotasVendidas).toBe(2);
  });
});
