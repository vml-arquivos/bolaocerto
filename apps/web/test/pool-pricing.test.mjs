import { test } from 'node:test';
import assert from 'node:assert/strict';
import { planPricing, toCents } from '../lib/pool-pricing.ts';

const base = { costCents: 6000, shares: 100 };
const plan = (o) => planPricing({ ...base, quotaMode: 'digitar', quotaValue: '20', feeMode: 'pct', feeValue: '10', ...o });

test('lê dinheiro como o administrador digita', () => {
  assert.equal(toCents('20'), 2000);
  assert.equal(toCents('20,50'), 2050);
  assert.equal(toCents('R$ 1.234,56'), 123456);
  assert.equal(toCents(''), null);
});

test('cota digitada R$ 20 com taxa de 10%: taxa R$ 2, total R$ 2.000', () => {
  const p = plan({});
  assert.ok(p.ok);
  assert.equal(p.registroPerShare, 60);
  assert.equal(p.quotaCents, 2000);
  assert.equal(p.feePerShare, 200);
  assert.equal(p.ticketPerShare, 1800);
  assert.equal(p.feeTotalCents, 20000);
  assert.equal(p.totalCents, 200000);
  assert.equal(p.feePct, 10);
});

test('taxa em R$ por cota, em R$ do bolão todo e "sobra" depois do registro', () => {
  const porCota = plan({ feeMode: 'cota', feeValue: '3' }); assert.ok(porCota.ok); assert.equal(porCota.feePerShare, 300);
  const total = plan({ feeMode: 'total', feeValue: '500' }); assert.ok(total.ok); assert.equal(total.feePerShare, 500); assert.equal(total.feeTotalCents, 50000);
  const sobra = plan({ feeMode: 'sobra', feeValue: '' }); assert.ok(sobra.ok); assert.equal(sobra.feePerShare, 1940); assert.equal(sobra.feePct, 97);
});

test('cota pelo registro: registro ÷ cotas + taxa em R$', () => {
  const p = plan({ quotaMode: 'registro', feeMode: 'cota', feeValue: '5' });
  assert.ok(p.ok); assert.equal(p.quotaCents, 560); assert.equal(p.feePerShare, 500); assert.equal(p.ticketPerShare, 60);
});

test('cota pelo registro com taxa em %: a taxa é parte da cota (cota = registro ÷ (1 − taxa))', () => {
  const p = plan({ quotaMode: 'registro', feeMode: 'pct', feeValue: '25' });
  assert.ok(p.ok); assert.equal(p.quotaCents, 80); assert.equal(p.feePerShare, 20);
  assert.equal(plan({ quotaMode: 'registro', feeMode: 'sobra', feeValue: '' }).ok, false);
});

test('recusa conta que não fecha e entradas inválidas, sem travar', () => {
  assert.equal(plan({ quotaValue: '0,50', feeMode: 'sobra' }).ok, false);
  assert.equal(plan({ feeValue: '99' }).ok, false); // sobraria menos que o registro de cada cota
  assert.equal(plan({ feeValue: '101' }).ok, false);
  assert.equal(plan({ quotaValue: '' }).ok, false);
  assert.equal(plan({ feeValue: '' }).ok, false);
  assert.equal(plan({ shares: 0 }).ok, false);
  assert.equal(plan({ quotaMode: 'registro', costCents: 0, feeValue: '10' }).ok, false);
});

test('registro, taxa e o que fica no bolão sempre fecham com o total arrecadado', () => {
  for (const o of [{}, { feeMode: 'cota', feeValue: '3' }, { quotaMode: 'registro', feeValue: '30' }, { costCents: 12345, shares: 7, quotaValue: '50', feeValue: '12,5' }, { costCents: 0, shares: 10, quotaValue: '5', feeValue: '20' }]) {
    const p = plan(o);
    assert.ok(p.ok);
    assert.equal(p.ticketPerShare * p.shares + p.feeTotalCents, p.totalCents);
    assert.equal(p.surplusCents, p.ticketPerShare * p.shares - p.costCents);
  }
});
