import { test } from 'node:test';
import assert from 'node:assert/strict';
import { canPurchase, withinSaleWindow } from '../lib/pool-availability.ts';
const now = Date.parse('2026-10-29T20:00:00Z');
const pool = { status: 'aberto', cotasDisponiveis: 10, concurso: { status: 'aberto', cutoffAt: '2026-10-29T21:00:00Z' } };
test('current and newly published contests can sell', () => assert.equal(canPurchase(pool, now), true));
test('past deadline hides even a stale open pool', () => assert.equal(withinSaleWindow(pool, now + 3600001), false));
test('exact cutoff is closed, including unlimited quotas', () => assert.equal(canPurchase({...pool, cotasDisponiveis:null}, now+3600000), false));
test('registered, settled, closed, draft and cancelled are never sales', () => {
  for (const status of ['registrado','apurado','fechado','rascunho','cancelado']) assert.equal(canPurchase({...pool,status},now),false);
});
test('official result stops sales even if deadline is still future', () => assert.equal(canPurchase({...pool,resultado:{numerosSorteados:[1]}},now),false));
test('closed contest stops sales independently of pool status', () => assert.equal(canPurchase({...pool,concurso:{...pool.concurso,status:'fechado'}},now),false));
test('missing or malformed deadlines fail closed', () => {
  assert.equal(canPurchase({...pool,concurso:undefined},now),false);
  assert.equal(canPurchase({...pool,concurso:{cutoffAt:'invalid'}},now),false);
});
test('sold out and conditional pools cannot be purchased', () => {
  assert.equal(canPurchase({...pool,cotasDisponiveis:0},now),false);
  assert.equal(canPurchase({...pool,liberacao:{condicional:true,liberado:false}},now),false);
});
test('old pool is hidden without hiding another open pool of the same modality', () => {
  const old = {...pool, concurso:{...pool.concurso, cutoffAt:'2026-10-28T21:00:00Z'}};
  assert.deepEqual([old,pool].filter(p=>withinSaleWindow(p,now)),[pool]);
});
