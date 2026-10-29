import { officialPriceRows, selectionKey, splitPool } from './pricing.engine';
import { PricingService } from './pricing.service';
const range = (n: number) => Array.from({ length: n }, (_, i) => i + 1);
const rows = officialPriceRows();
const price = (mod: string, key: string) => rows.find(r => r.modalidade === mod && r.chave === key)?.valorCentavos;
describe('Official pricing and conservation of cents', () => {
  it.each([['megasena','6',600],['megasena','7',4200],['megasena','20',23256000],['lotofacil','20',5426400],['quina','15',900900],['duplasena','15',1501500],['diadesorte','15',1608750],['lotomania','50',300],['timemania','10',350],['maismilionaria','12+6',8316000],['supersete','21',656100],['loteca','5d3t',172800]])('%s/%s has verified cents %s', (m,k,c) => expect(price(String(m),String(k))).toBe(c));
  it('rejects duplicate numbers instead of silently dropping them', () => expect(() => selectionKey('megasena', { numeros: [1,1,2,3,4,5] })).toThrow());
  it('accepts zero in Lotomania and rejects 100', () => {
    expect(selectionKey('lotomania', { numeros: Array.from({length:50}, (_,i)=>i) })).toBe('50');
    expect(() => selectionKey('lotomania', { numeros: [...range(49), 100] })).toThrow();
  });
  it('requires special prognostics', () => {
    expect(() => selectionKey('maismilionaria', { numeros: range(6) })).toThrow();
    expect(() => selectionKey('diadesorte', { numeros: range(7) })).toThrow();
    expect(selectionKey('maismilionaria', { numeros: range(6), trevos: [1,2] })).toBe('6+2');
  });
  it('preserves Super Sete positions and rejects uneven illegal columns', () => {
    expect(selectionKey('supersete', { numeros: [], colunas: [[0],[0],[0],[0],[0],[0],[0]] })).toBe('7');
    expect(() => selectionKey('supersete', { numeros: [], colunas: [[0,1,2],[0],[0],[0],[0],[0],[0]] })).toThrow();
  });
  it('sums mixed games on server, never accepts caller cost', async () => {
    const service = new PricingService({ precoLoteria: { findMany: async () => rows.filter(r => r.modalidade === 'megasena').map(r => ({ ...r, id: r.chave })) } } as never);
    const q = await service.quote('megasena', [{ numeros: range(6) }, { numeros: range(7) }], 10, 10);
    expect(q).toMatchObject({ costCents: 4800, quotaCents: 528, adminTotalCents: 480, ticketBudgetCents: 4800 });
  });
  it('fails closed if a price is missing or overlaps', async () => {
    for (const prices of [[], [rows[0], rows[0]]]) {
      const service = new PricingService({ precoLoteria: { findMany: async () => prices } } as never);
      await expect(service.quote('megasena', [{ numeros: range(6) }], 10, 10)).rejects.toThrow();
    }
  });
  it('all equal quotas conserve cents including explicit residual reserve', () => {
    for (let cost = 1; cost < 1000; cost += 13) for (let shares = 1; shares <= 100; shares++) {
      const q = splitPool(cost, shares, 3500);
      expect(q.totalCents).toBe(q.costCents + q.roundingReserveCents + q.adminTotalCents);
      expect(q.roundingReserveCents).toBeLessThan(shares);
      expect(q.ticketBudgetCents).toBeGreaterThanOrEqual(cost);
    }
  });
  it('rejects invalid finance inputs', () => {
    for (const n of [0, -1, 1.5, Infinity, NaN]) expect(() => splitPool(600, n, 1000)).toThrow();
    expect(() => splitPool(600, 10, 3501)).toThrow();
  });
});
