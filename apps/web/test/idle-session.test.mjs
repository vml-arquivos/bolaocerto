import test from 'node:test';
import assert from 'node:assert/strict';
import { heartbeatMs, isIdle, isProtectedPath, loginPathFor } from '../lib/idle-session.ts';

const MIN = 60_000;

test('ocioso só depois de passar do limite; sem registro de atividade não derruba', () => {
  const now = 1_000_000_000;
  assert.equal(isIdle(now - 29 * MIN, now, 30), false);
  assert.equal(isIdle(now - 31 * MIN, now, 30), true);
  assert.equal(isIdle(now - 31 * MIN, now, 60), false);
  assert.equal(isIdle(0, now, 30), false);
});

test('renova bem antes do limite: no máximo a cada 10 minutos e no mínimo a cada minuto', () => {
  assert.equal(heartbeatMs(30), 10 * MIN);
  assert.equal(heartbeatMs(60), 10 * MIN);
  assert.equal(heartbeatMs(5), Math.floor((5 * MIN) / 3));
  assert.ok(heartbeatMs(30) < 30 * MIN);
});

test('cada tipo de conta volta para a sua própria entrada', () => {
  assert.equal(loginPathFor('admin'), '/admin/entrar');
  assert.equal(loginPathFor('operacao'), '/admin/entrar');
  assert.equal(loginPathFor('afiliado'), '/afiliado/entrar');
  assert.equal(loginPathFor('cotista'), '/login');
  assert.equal(loginPathFor(null), '/login');
});

test('páginas só de quem entrou levam ao login; as públicas não', () => {
  for (const path of ['/admin', '/admin/qualquer', '/afiliado', '/aplicativo', '/minha-conta', '/checkout/abc']) assert.equal(isProtectedPath(path), true, path);
  for (const path of ['/', '/boloes/1', '/resultados', '/afiliado-teste']) assert.equal(isProtectedPath(path), false, path);
});
