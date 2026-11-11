import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ADMIN_HUBS, hubOf, viewTitle } from '../lib/admin-nav.ts';

test('cada tela pertence a no máximo um item do menu', () => {
  const seen = new Map();
  for (const hub of ADMIN_HUBS) for (const [view] of hub.tabs) { assert.ok(!seen.has(view), `${view} repetida em ${seen.get(view)} e ${hub.key}`); seen.set(view, hub.key); }
});
test('os links antigos continuam achando o seu grupo', () => {
  assert.equal(hubOf('recebimentos')?.key, 'financeiro');
  assert.equal(hubOf('pagamentos')?.key, 'financeiro');
  assert.equal(hubOf('repasses')?.key, 'financeiro');
  assert.equal(hubOf('notas-fiscais')?.key, 'financeiro');
  assert.equal(hubOf('carteira')?.key, 'financeiro');
  assert.equal(hubOf('cupons')?.key, 'financeiro');
  assert.equal(hubOf('comprovantes')?.key, 'operacao');
  assert.equal(hubOf('lotericas')?.key, 'operacao');
  assert.equal(hubOf('jogos')?.key, 'boloes');
  assert.equal(hubOf('cotas')?.key, 'boloes');
  assert.equal(hubOf('controle')?.key, 'boloes');
  assert.equal(hubOf('concursos'), null);
});
test('a primeira aba é a entrada do grupo', () => {
  for (const hub of ADMIN_HUBS) assert.equal(hub.tabs[0][0], hub.entry);
});
test('título da barra de cima', () => {
  assert.equal(viewTitle('financeiro'), 'Financeiro');
  assert.equal(viewTitle('comissoes'), 'Financeiro · Comissões');
  assert.equal(viewTitle('concursos', 'Concursos'), 'Concursos');
});
