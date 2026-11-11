import { ConflictException } from '@nestjs/common';
import { checkCoupon, holdsCouponUse, resolveCoupon } from './coupons';

const NOW = new Date('2026-11-11T12:00:00Z');
const base = { id: 'c1', codigo: 'COTISTA10', descricao: null, tipo: 'percentual', valor: 10, descontoMaximoCentavos: null, valorMinimoCentavos: null, automatico: false, ativo: true, inicioEm: null, fimEm: null, limiteTotal: null, limitePorCliente: 1, grupoIds: ['g1'], usuarioIds: [] as string[], criadoPor: 'a', criadoEm: NOW, atualizadoEm: NOW };

function fakeDb(opts: { coupons?: Array<typeof base>; groups?: string[]; usedTotal?: number; usedByUser?: number } = {}) {
  const coupons = opts.coupons ?? [base];
  return {
    grupoMembro: { findMany: async () => (opts.groups ?? ['g1']).map((grupoId) => ({ grupoId })) },
    cupom: {
      findUnique: async ({ where }: any) => coupons.find((item) => item.codigo === where.codigo) ?? null,
      findUniqueOrThrow: async ({ where }: any) => coupons.find((item) => item.id === where.id)!,
      findMany: async () => coupons.filter((item) => item.automatico && item.ativo),
    },
    cupomUso: { count: async ({ where }: any) => (where.usuarioId ? opts.usedByUser ?? 0 : opts.usedTotal ?? 0) },
    $queryRaw: async () => [],
  } as any;
}
const buy = { userId: 'u1', grossCents: 10_000, feeCents: 1_000, now: NOW };

describe('checkCoupon', () => {
  it('aplica o desconto dentro da taxa para quem está no grupo', async () => {
    const result = await checkCoupon(fakeDb(), base as any, { ...buy, groups: ['g1'] });
    expect(result).toEqual({ ok: true, discount: 1000 });
  });
  it('quem não está no público recebe mensagem genérica', async () => {
    const result = await checkCoupon(fakeDb(), base as any, { ...buy, groups: ['outro'] });
    expect(result.ok).toBe(false);
    expect((result as any).audience).toBe(false);
  });
  it('cupom pausado não vale', async () => {
    expect((await checkCoupon(fakeDb(), { ...base, ativo: false } as any, { ...buy, groups: ['g1'] })).ok).toBe(false);
  });
  it('respeita início, fim, limite total, limite por cliente e compra mínima', async () => {
    const g = { ...buy, groups: ['g1'] };
    expect((await checkCoupon(fakeDb(), { ...base, inicioEm: new Date('2026-12-01') } as any, g)).ok).toBe(false);
    expect((await checkCoupon(fakeDb(), { ...base, fimEm: new Date('2026-11-01') } as any, g)).ok).toBe(false);
    expect((await checkCoupon(fakeDb({ usedTotal: 5 }), { ...base, limiteTotal: 5 } as any, g)).ok).toBe(false);
    expect((await checkCoupon(fakeDb({ usedTotal: 4 }), { ...base, limiteTotal: 5 } as any, g)).ok).toBe(true);
    expect((await checkCoupon(fakeDb({ usedByUser: 1 }), base as any, g)).ok).toBe(false);
    expect((await checkCoupon(fakeDb(), { ...base, valorMinimoCentavos: 20_000 } as any, g)).ok).toBe(false);
  });
  it('100% deixa a cota grátis e nunca fica abaixo de zero', async () => {
    const result = await checkCoupon(fakeDb(), { ...base, valor: 100 } as any, { ...buy, groups: ['g1'] });
    expect(result).toEqual({ ok: true, discount: 10_000 });
  });
  it('desconto parcial respeita o mínimo cobrável', async () => {
    const result = await checkCoupon(fakeDb(), { ...base, valor: 99 } as any, { ...buy, groups: ['g1'] });
    expect(result).toEqual({ ok: true, discount: 9_500 });
  });
  it('cupom sem público vale para qualquer pessoa com o código', async () => {
    const open = { ...base, grupoIds: [] as string[], usuarioIds: [] as string[] };
    expect(await checkCoupon(fakeDb(), open as any, { ...buy, groups: [] })).toEqual({ ok: true, discount: 1000 });
    expect((await checkCoupon(fakeDb({ usedByUser: 1 }), open as any, { ...buy, groups: [] })).ok).toBe(false);
  });
});

describe('resolveCoupon', () => {
  it('com código inexistente falha com erro claro', async () => {
    await expect(resolveCoupon(fakeDb(), { userId: 'u1', code: 'NAOEXISTE', grossCents: 10_000, feeCents: 1_000, now: NOW })).rejects.toBeInstanceOf(ConflictException);
  });
  it('cupom aberto (sem público) funciona para qualquer cliente, com código', async () => {
    const open = { ...base, grupoIds: [] as string[], usuarioIds: [] as string[] };
    const applied = await resolveCoupon(fakeDb({ coupons: [open], groups: [] }), { userId: 'qualquer', code: 'cotista10', grossCents: 10_000, feeCents: 1_000, now: NOW });
    expect(applied).toMatchObject({ cupomId: 'c1', descontoCentavos: 1000 });
  });
  it('cupom automático sem público nunca é aplicado sozinho', async () => {
    const open = { ...base, automatico: true, grupoIds: [] as string[], usuarioIds: [] as string[] };
    expect(await resolveCoupon(fakeDb({ coupons: [open], groups: [] }), { userId: 'u1', grossCents: 10_000, feeCents: 1_000, now: NOW })).toBeNull();
  });
  it('com código válido devolve o desconto', async () => {
    const applied = await resolveCoupon(fakeDb(), { userId: 'u1', code: ' cotista10 ', grossCents: 10_000, feeCents: 1_000, now: NOW });
    expect(applied).toMatchObject({ cupomId: 'c1', descontoCentavos: 1000, automatico: false });
  });
  it('sem código e sem cupom automático não aplica nada', async () => {
    expect(await resolveCoupon(fakeDb(), { userId: 'u1', grossCents: 10_000, feeCents: 1_000, now: NOW })).toBeNull();
  });
  it('sem código escolhe o automático de maior desconto', async () => {
    const small = { ...base, id: 'a', codigo: 'A', automatico: true, valor: 2 };
    const big = { ...base, id: 'b', codigo: 'B', automatico: true, valor: 7 };
    const applied = await resolveCoupon(fakeDb({ coupons: [small, big] }), { userId: 'u1', grossCents: 10_000, feeCents: 1_000, now: NOW });
    expect(applied).toMatchObject({ cupomId: 'b', descontoCentavos: 700, automatico: true });
  });
  it('cupom automático de outro grupo não é aplicado', async () => {
    const other = { ...base, automatico: true, grupoIds: ['g9'] };
    expect(await resolveCoupon(fakeDb({ coupons: [other] }), { userId: 'u1', grossCents: 10_000, feeCents: 1_000, now: NOW })).toBeNull();
  });
});

describe('holdsCouponUse', () => {
  it('reserva só segura o uso dentro do prazo', () => {
    const where = holdsCouponUse(NOW) as any;
    expect(where.OR[1]).toMatchObject({ status: 'reservada', expiraReservaEm: { gt: NOW } });
  });
});
