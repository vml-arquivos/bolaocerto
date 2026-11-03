import { test } from 'node:test';
import assert from 'node:assert/strict';
import { homeForRole, landingFor, isStaff } from '../lib/roles.ts';
test('cada papel tem sua tela inicial', () => {
  assert.equal(homeForRole('cotista'), '/aplicativo');
  assert.equal(homeForRole('afiliado'), '/afiliado');
  assert.equal(homeForRole('admin'), '/admin');
  assert.equal(homeForRole('operacao'), '/admin?view=operacao');
  assert.equal(homeForRole(undefined), '/aplicativo');
});
test('equipe é admin e operação', () => {
  assert.equal(isStaff('admin'), true); assert.equal(isStaff('operacao'), true);
  assert.equal(isStaff('afiliado'), false); assert.equal(isStaff('cotista'), false);
});
test('next só vale quando o papel pode abrir a tela', () => {
  assert.equal(landingFor('afiliado', '/afiliado'), '/afiliado');
  assert.equal(landingFor('cotista', '/afiliado'), '/aplicativo');
  assert.equal(landingFor('cotista', '/boloes/123'), '/boloes/123');
  assert.equal(landingFor('cotista', '/admin'), '/aplicativo');
  assert.equal(landingFor('admin', '/admin?view=boloes'), '/admin?view=boloes');
  assert.equal(landingFor('operacao', '/admin?view=usuarios'), '/admin?view=operacao');
});
test('next externo ou malformado é ignorado', () => {
  assert.equal(landingFor('cotista', '//evil.com'), '/aplicativo');
  assert.equal(landingFor('cotista', 'https://evil.com'), '/aplicativo');
  assert.equal(landingFor('cotista', '/\\evil.com'), '/aplicativo');
});
