import { test } from 'node:test';
import assert from 'node:assert/strict';
import { shortDate } from '../lib/domain.ts';

test('data sem horário conhecido (meia-noite de Brasília) mostra só o dia', () => {
  assert.equal(shortDate('2026-11-06T03:00:00.000Z'), '06 de nov.');
  assert.ok(!shortDate('2026-11-06T03:00:00.000Z').includes(':'));
});
test('data com horário mostra o horário de Brasília', () => {
  assert.match(shortDate('2026-11-17T23:00:00.000Z'), /17 de nov\..*20:00/);
  assert.match(shortDate('2026-12-31T23:00:00.000Z'), /31 de dez\..*20:00/);
});
test('valor vazio ou inválido vira "A definir"', () => {
  assert.equal(shortDate(undefined), 'A definir');
  assert.equal(shortDate('lixo'), 'A definir');
});
