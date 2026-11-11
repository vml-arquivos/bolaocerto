import { applyDiscount, campaignApplies, campaignCashbackCents, couponDiscountCents, describeCoupon, inAudience, inPeriod, meetsLevel, minPayableCents, normalizeCouponCode, subsidyCents } from './promo-math';

describe('couponDiscountCents', () => {
  // Cota de R$ 20,00 (total 2000). O cliente nunca paga menos que o mínimo cobrável (R$ 5,00 = 500), exceto cota grátis.
  const gross = 2000;
  it('percentual sobre o total', () => {
    expect(couponDiscountCents({ tipo: 'percentual', valor: 5 }, gross)).toBe(100);
    expect(couponDiscountCents({ tipo: 'percentual', valor: 50 }, gross)).toBe(1000);
  });
  it('valor fixo', () => {
    expect(couponDiscountCents({ tipo: 'valor', valor: 1.5 }, gross)).toBe(150);
    expect(couponDiscountCents({ tipo: 'valor', valor: 10 }, gross)).toBe(1000);
  });
  it('100% (ou valor que cobre tudo) deixa a cota grátis', () => {
    expect(couponDiscountCents({ tipo: 'percentual', valor: 100 }, gross)).toBe(gross);
    expect(couponDiscountCents({ tipo: 'valor', valor: 20 }, gross)).toBe(gross);
    expect(couponDiscountCents({ tipo: 'valor', valor: 500 }, gross)).toBe(gross);
    expect(couponDiscountCents({ tipo: 'percentual', valor: 500 }, gross)).toBe(gross);
  });
  it('desconto parcial nunca deixa o total abaixo do mínimo cobrável', () => {
    expect(couponDiscountCents({ tipo: 'percentual', valor: 99 }, gross)).toBe(1500);
    expect(couponDiscountCents({ tipo: 'valor', valor: 19.5 }, gross)).toBe(1500);
    expect(couponDiscountCents({ tipo: 'percentual', valor: 99 }, gross, 100)).toBe(1900);
    expect(couponDiscountCents({ tipo: 'percentual', valor: 50 }, 400)).toBe(0);
  });
  it('respeita o teto do cupom e a compra mínima', () => {
    expect(couponDiscountCents({ tipo: 'percentual', valor: 9, descontoMaximoCentavos: 120 }, gross)).toBe(120);
    expect(couponDiscountCents({ tipo: 'valor', valor: 1, valorMinimoCentavos: 5000 }, gross)).toBe(0);
    expect(couponDiscountCents({ tipo: 'valor', valor: 1, valorMinimoCentavos: 2000 }, gross)).toBe(100);
    // Com teto, 100% deixa de ser grátis.
    expect(couponDiscountCents({ tipo: 'percentual', valor: 100, descontoMaximoCentavos: 500 }, gross)).toBe(500);
  });
  it('entradas ruins nunca dão desconto nem valor negativo', () => {
    for (const bad of [0, -5, NaN, Infinity]) expect(couponDiscountCents({ tipo: 'valor', valor: bad }, gross)).toBe(0);
    expect(couponDiscountCents({ tipo: 'valor', valor: 1 }, 0)).toBe(0);
    expect(couponDiscountCents({ tipo: 'valor', valor: 1 }, -100)).toBe(0);
    expect(couponDiscountCents({ tipo: 'valor', valor: 1 }, 20.5 as number)).toBe(0);
  });
  it('arredonda para baixo (nunca dá centavo a mais)', () => {
    expect(couponDiscountCents({ tipo: 'percentual', valor: 3.33 }, 1999)).toBe(66);
  });
  it('mínimo cobrável vem do provedor (padrão R$ 5,00)', () => {
    expect(minPayableCents(undefined)).toBe(500);
    expect(minPayableCents('5')).toBe(500);
    expect(minPayableCents('1.5')).toBe(150);
    expect(minPayableCents('abc')).toBe(500);
    expect(minPayableCents('0')).toBe(500);
  });
  it('quanto do desconto passou da taxa (quem paga é o BL)', () => {
    expect(subsidyCents(100, 182)).toBe(0);
    expect(subsidyCents(2000, 182)).toBe(1818);
    expect(subsidyCents(-5, 182)).toBe(0);
  });
});

describe('applyDiscount', () => {
  const base = { gross: 20, cost: 18.18, adminFee: 1.82, affiliateCommission: 0.36 };
  const closes = (out: { gross: number; cost: number; adminFee: number }) => Math.round((out.cost + out.adminFee) * 100) === Math.round(out.gross * 100);
  it('dentro da taxa: custo dos jogos intacto, total e taxa caem juntos e a conta fecha', () => {
    const out = applyDiscount(base, 100, 20);
    expect(out.cost).toBe(18.18);
    expect(out.gross).toBe(19);
    expect(out.adminFee).toBe(0.82);
    expect(closes(out)).toBe(true);
    expect(out.affiliateCommission).toBe(0.16);
  });
  it('acima da taxa: taxa zera, o resto sai do custo registrado e a conta fecha', () => {
    const out = applyDiscount(base, 1500, 20);
    expect(out.gross).toBe(5);
    expect(out.adminFee).toBe(0);
    expect(out.cost).toBe(5);
    expect(out.affiliateCommission).toBe(0);
    expect(closes(out)).toBe(true);
  });
  it('100%: tudo zero e nada negativo', () => {
    const out = applyDiscount(base, 2000, 20);
    expect(out).toEqual({ gross: 0, cost: 0, adminFee: 0, affiliateCommission: 0 });
  });
  it('desconto maior que o total é cortado no total', () => {
    expect(applyDiscount(base, 99999, 20).gross).toBe(0);
  });
  it('desconto zero, negativo ou inválido não muda nada', () => {
    for (const d of [0, -10, NaN]) expect(applyDiscount(base, d, 20)).toEqual(base);
  });
  it('várias cotas e valores quebrados continuam fechando ao centavo', () => {
    for (const [qty, d] of [[3, 55], [7, 1], [10, 70], [3, 6000], [7, 14000]] as const) {
      const gross = Math.round(20 * qty * 100) / 100;
      const cost = Math.round((gross / 1.1) * 100) / 100;
      const fee = Math.round((gross - cost) * 100) / 100;
      const out = applyDiscount({ gross, cost, adminFee: fee, affiliateCommission: 0 }, d, 15);
      expect(closes(out)).toBe(true);
      expect(out.adminFee).toBeGreaterThanOrEqual(0);
      expect(out.cost).toBeGreaterThanOrEqual(0);
      expect(out.gross).toBeGreaterThanOrEqual(0);
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

describe('nível do cliente no cashback', () => {
  it('gasto e compras mínimos: precisa dos dois quando os dois existem', () => {
    const level = { gastoMinimoCentavos: 10_000, comprasMinimas: 3 };
    expect(meetsLevel(level, { spentCents: 10_000, purchases: 3 })).toBe(true);
    expect(meetsLevel(level, { spentCents: 9_999, purchases: 3 })).toBe(false);
    expect(meetsLevel(level, { spentCents: 50_000, purchases: 2 })).toBe(false);
    expect(meetsLevel({ comprasMinimas: 3 }, { spentCents: 0, purchases: 3 })).toBe(true);
    expect(meetsLevel({ gastoMinimoCentavos: 500 }, { spentCents: 500, purchases: 0 })).toBe(true);
  });
  it('sem nível definido, ninguém atinge', () => {
    expect(meetsLevel({}, { spentCents: 1e9, purchases: 1e6 })).toBe(false);
    expect(meetsLevel({ gastoMinimoCentavos: null, comprasMinimas: null }, { spentCents: 1e9, purchases: 1e6 })).toBe(false);
  });
  it('campanha vale por grupo/cliente OU por nível', () => {
    const campaign = { grupoIds: ['g1'], usuarioIds: [], gastoMinimoCentavos: 10_000, comprasMinimas: null };
    expect(campaignApplies(campaign, 'u1', ['g1'], { spentCents: 0, purchases: 0 })).toBe(true);
    expect(campaignApplies(campaign, 'u1', ['g2'], { spentCents: 10_000, purchases: 1 })).toBe(true);
    expect(campaignApplies(campaign, 'u1', ['g2'], { spentCents: 9_999, purchases: 99 })).toBe(false);
    expect(campaignApplies(campaign, 'u1', ['g2'], null)).toBe(false);
    expect(campaignApplies({ grupoIds: [], usuarioIds: [], gastoMinimoCentavos: null, comprasMinimas: null }, 'u1', ['g1'], { spentCents: 1e9, purchases: 99 })).toBe(false);
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
