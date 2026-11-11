import { applyDiscount, campaignCashbackCents, couponDiscountCents, describeCoupon, inAudience, inPeriod, normalizeCouponCode } from './promo-math';

describe('couponDiscountCents', () => {
  // Cota de R$ 20,00 com taxa de 10%: total 2000, taxa 182 (20 - 20/1,1 = 1,82).
  const gross = 2000, fee = 182;
  it('percentual sobre o total, limitado pela taxa', () => {
    expect(couponDiscountCents({ tipo: 'percentual', valor: 5 }, gross, fee)).toBe(100);
    expect(couponDiscountCents({ tipo: 'percentual', valor: 50 }, gross, fee)).toBe(fee);
  });
  it('valor fixo, limitado pela taxa', () => {
    expect(couponDiscountCents({ tipo: 'valor', valor: 1.5 }, gross, fee)).toBe(150);
    expect(couponDiscountCents({ tipo: 'valor', valor: 10 }, gross, fee)).toBe(fee);
  });
  it('respeita o teto do cupom e a compra mínima', () => {
    expect(couponDiscountCents({ tipo: 'percentual', valor: 9, descontoMaximoCentavos: 120 }, gross, fee)).toBe(120);
    expect(couponDiscountCents({ tipo: 'valor', valor: 1, valorMinimoCentavos: 5000 }, gross, fee)).toBe(0);
    expect(couponDiscountCents({ tipo: 'valor', valor: 1, valorMinimoCentavos: 2000 }, gross, fee)).toBe(100);
  });
  it('entradas ruins nunca dão desconto nem valor negativo', () => {
    for (const bad of [0, -5, NaN, Infinity]) expect(couponDiscountCents({ tipo: 'valor', valor: bad }, gross, fee)).toBe(0);
    expect(couponDiscountCents({ tipo: 'valor', valor: 1 }, 0, fee)).toBe(0);
    expect(couponDiscountCents({ tipo: 'valor', valor: 1 }, gross, 0)).toBe(0);
    expect(couponDiscountCents({ tipo: 'valor', valor: 1 }, 20.5 as number, fee)).toBe(0);
    expect(couponDiscountCents({ tipo: 'percentual', valor: 500 }, gross, 99999)).toBe(1999); // 100% nunca zera a compra
  });
  it('arredonda para baixo (nunca dá centavo a mais)', () => {
    expect(couponDiscountCents({ tipo: 'percentual', valor: 3.33 }, 1999, 500)).toBe(66);
  });
});

describe('applyDiscount', () => {
  const base = { gross: 20, cost: 18.18, adminFee: 1.82, affiliateCommission: 0.36 };
  it('custo dos jogos intacto, total e taxa caem juntos e a conta fecha', () => {
    const out = applyDiscount(base, 100, 20);
    expect(out.cost).toBe(18.18);
    expect(out.gross).toBe(19);
    expect(out.adminFee).toBe(0.82);
    expect(Math.round((out.cost + out.adminFee) * 100)).toBe(Math.round(out.gross * 100));
    expect(out.affiliateCommission).toBe(0.16);
  });
  it('desconto maior que a taxa é cortado na taxa', () => {
    const out = applyDiscount(base, 9999, 20);
    expect(out.adminFee).toBe(0);
    expect(out.gross).toBe(18.18);
    expect(out.affiliateCommission).toBe(0);
  });
  it('desconto zero, negativo ou inválido não muda nada', () => {
    for (const d of [0, -10, NaN]) expect(applyDiscount(base, d, 20)).toEqual(base);
  });
  it('várias cotas e valores quebrados continuam fechando ao centavo', () => {
    for (const [qty, d] of [[3, 55], [7, 1], [10, 70]] as const) {
      const gross = Math.round(20 * qty * 100) / 100;
      const cost = Math.round((gross / 1.1) * 100) / 100;
      const fee = Math.round((gross - cost) * 100) / 100;
      const out = applyDiscount({ gross, cost, adminFee: fee, affiliateCommission: 0 }, d, 15);
      expect(Math.round((out.cost + out.adminFee) * 100)).toBe(Math.round(out.gross * 100));
      expect(out.adminFee).toBeGreaterThanOrEqual(0);
    }
  });
});

describe('público e período', () => {
  it('vale só para os grupos e clientes escolhidos', () => {
    const audience = { grupoIds: ['g1'], usuarioIds: ['u9'] };
    expect(inAudience(audience, 'u1', ['g1', 'g2'])).toBe(true);
    expect(inAudience(audience, 'u9', [])).toBe(true);
    expect(inAudience(audience, 'u1', ['g2'])).toBe(false);
    expect(inAudience({ grupoIds: [], usuarioIds: [] }, 'u1', ['g1'])).toBe(false);
  });
  it('período com início e fim abertos', () => {
    const now = new Date('2026-11-11T12:00:00Z');
    expect(inPeriod({}, now)).toBe(true);
    expect(inPeriod({ inicioEm: new Date('2026-11-12T00:00:00Z') }, now)).toBe(false);
    expect(inPeriod({ fimEm: new Date('2026-11-10T00:00:00Z') }, now)).toBe(false);
    expect(inPeriod({ inicioEm: new Date('2026-11-01T00:00:00Z'), fimEm: new Date('2026-11-30T00:00:00Z') }, now)).toBe(true);
  });
  it('código normalizado', () => {
    expect(normalizeCouponCode(' bolão 10! ')).toBe('BOLAO10');
    expect(normalizeCouponCode('amigos_do-bl')).toBe('AMIGOS_DO-BL');
    expect(normalizeCouponCode(null)).toBe('');
    expect(normalizeCouponCode('a'.repeat(80))).toHaveLength(40);
  });
});

describe('campaignCashbackCents', () => {
  const input = { paidCents: 2000, feeCents: 182, commissionCents: 36, percentual: 5 };
  it('percentual do que foi pago', () => { expect(campaignCashbackCents(input)).toBe(100); });
  it('nunca passa do que sobra da taxa depois da comissão', () => {
    expect(campaignCashbackCents({ ...input, percentual: 50 })).toBe(146);
    expect(campaignCashbackCents({ ...input, percentual: 50, alreadyGrantedCents: 100 })).toBe(46);
    expect(campaignCashbackCents({ ...input, percentual: 50, alreadyGrantedCents: 500 })).toBe(0);
  });
  it('respeita mínimo, teto por compra e o que resta do orçamento', () => {
    expect(campaignCashbackCents({ ...input, minimumCents: 3000 })).toBe(0);
    expect(campaignCashbackCents({ ...input, maxPerPurchaseCents: 40 })).toBe(40);
    expect(campaignCashbackCents({ ...input, budgetLeftCents: 25 })).toBe(25);
    expect(campaignCashbackCents({ ...input, budgetLeftCents: 0 })).toBe(0);
    expect(campaignCashbackCents({ ...input, budgetLeftCents: -10 })).toBe(0);
  });
  it('entradas ruins não geram crédito', () => {
    for (const bad of [0, -1, NaN]) expect(campaignCashbackCents({ ...input, percentual: bad })).toBe(0);
    expect(campaignCashbackCents({ ...input, paidCents: 0 })).toBe(0);
    expect(campaignCashbackCents({ ...input, feeCents: 0 })).toBe(0);
    expect(campaignCashbackCents({ ...input, commissionCents: 9999 })).toBe(0);
  });
});

describe('describeCoupon', () => {
  it('texto curto', () => {
    expect(describeCoupon({ tipo: 'percentual', valor: 10 })).toBe('10% de desconto');
    expect(describeCoupon({ tipo: 'valor', valor: 2.5 })).toBe('R$ 2,50 de desconto');
  });
});
