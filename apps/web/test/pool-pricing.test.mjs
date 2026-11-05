import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPricing, toCents } from '../lib/pool-pricing.ts';

const base = { costCents: 6000, shares: 100 };

test('lê dinheiro como o administrador digita', () => {
  assert.equal(toCents('20'), 2000);
  assert.equal(toCents('20,50'), 2050);
  assert.equal(toCents('R$ 1.234,56'), 123456);
  assert.equal(toCents(''), null);
});

test('valor da cota livre: R$ 20 com registro de R$ 60 em 100 cotas', () => {
  const plan = planPricing({ ...base, mode: 'cota', value: '20' });
  assert.ok(plan.ok);
  assert.equal(plan.ticketPerShare, 60);
  assert.equal(plan.feePerShare, 1940);
  assert.equal(plan.feePct, 97);
  assert.equal(plan.feeTotalCents, 194000);
  assert.equal(plan.totalCents, 200000);
});

test('taxa em % (da cota): 25% de uma cota que cobre R$ 0,60 de registro', () => {
  const plan = planPricing({ ...base, mode: 'pct', value: '25' });
  assert.ok(plan.ok);
  assert.equal(plan.quotaCents, 80); // 0,60 / 0,75
  assert.equal(plan.feePerShare, 20);
});

test('taxa fechada em R$ por cota e em R$ total do bolão', () => {
  const perShare = planPricing({ ...base, mode: 'taxa_cota', value: '5' });
  assert.ok(perShare.ok); assert.equal(perShare.quotaCents, 560);
  const total = planPricing({ ...base, mode: 'taxa_total', value: '500' });
  assert.ok(total.ok); assert.equal(total.feePerShare, 500); assert.equal(total.feeTotalCents, 50000);
});

test('recusa cota que não cobre o registro e entradas inválidas, sem travar', () => {
  assert.equal(planPricing({ ...base, mode: 'cota', value: '0,50' }).ok, false);
  assert.equal(planPricing({ ...base, mode: 'pct', value: '100' }).ok, false);
  assert.equal(planPricing({ ...base, mode: 'cota', value: '' }).ok, false);
  assert.equal(planPricing({ costCents: 0, shares: 100, mode: 'pct', value: '10' }).ok, false);
  assert.equal(planPricing({ costCents: 6000, shares: 0, mode: 'cota', value: '20' }).ok, false);
});

test('a soma do registro com a taxa fecha com o total arrecadado', () => {
  for (const [cost, shares, mode, value] of [[6000, 100, 'cota', '20'], [12345, 7, 'pct', '30'], [999, 3, 'taxa_total', '10'], [0, 10, 'cota', '5']]) {
    const plan = planPricing({ costCents: cost, shares, mode, value });
    assert.ok(plan.ok);
    assert.equal(plan.ticketPerShare * plan.shares + plan.feeTotalCents, plan.totalCents);
  }
});
