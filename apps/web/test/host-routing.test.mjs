import { test } from 'node:test';
import assert from 'node:assert/strict';
import { routeByHost } from '../lib/host-routing.ts';
const base = { adminHost: 'admin.bolao.com.br', proto: 'https' };
test('sem ADMIN_HOST nada muda', () => {
  assert.deepEqual(routeByHost({ host: 'bolao.com.br', adminHost: undefined, pathname: '/admin' }), { action: 'next' });
  assert.deepEqual(routeByHost({ host: 'bolao.com.br', adminHost: '', pathname: '/' }), { action: 'next' });
});
test('painel no endereço próprio abre normalmente', () => {
  assert.deepEqual(routeByHost({ ...base, host: 'admin.bolao.com.br', pathname: '/admin/entrar' }), { action: 'next' });
  assert.deepEqual(routeByHost({ ...base, host: 'admin.bolao.com.br:443', pathname: '/redefinir-senha' }), { action: 'next' });
});
test('raiz e páginas de cliente no endereço do painel vão para /admin', () => {
  assert.deepEqual(routeByHost({ ...base, host: 'admin.bolao.com.br', pathname: '/' }), { action: 'redirect', url: 'https://admin.bolao.com.br/admin' });
  assert.deepEqual(routeByHost({ ...base, host: 'admin.bolao.com.br', pathname: '/minha-conta' }), { action: 'redirect', url: 'https://admin.bolao.com.br/admin' });
});
test('/admin no site dos clientes vai para o endereço do painel', () => {
  assert.deepEqual(routeByHost({ ...base, host: 'bolao.com.br', pathname: '/admin', search: '?view=boloes' }), { action: 'redirect', url: 'https://admin.bolao.com.br/admin?view=boloes' });
  assert.deepEqual(routeByHost({ ...base, host: 'bolao.com.br', pathname: '/boloes/1' }), { action: 'next' });
  assert.deepEqual(routeByHost({ ...base, host: 'bolao.com.br', pathname: '/administracao' }), { action: 'next' });
});

import { publicOrigin } from '../lib/public-origin.ts';
test('redirecionamento usa o endereço público, nunca o interno do servidor (0.0.0.0:3000)', () => {
  const requestUrl = 'http://0.0.0.0:3000/r/ADM-1';
  assert.equal(publicOrigin({ host: '0.0.0.0:3000', forwardedHost: 'bolaolivre.com', forwardedProto: 'https', requestUrl, production: true }), 'https://bolaolivre.com');
  assert.equal(publicOrigin({ host: 'bolaolivre.com', requestUrl, production: true }), 'https://bolaolivre.com');
  assert.equal(publicOrigin({ host: '0.0.0.0:3000', forwardedHost: 'bolaolivre.com, interno', forwardedProto: 'https, http', requestUrl, production: true }), 'https://bolaolivre.com');
  // Sem cabeçalhos do proxy: usa o endereço configurado, e só em último caso o da requisição.
  assert.equal(publicOrigin({ host: '0.0.0.0:3000', requestUrl, production: true, fallback: 'https://bolaolivre.com/qualquer' }), 'https://bolaolivre.com');
  assert.equal(publicOrigin({ host: '0.0.0.0:3000', requestUrl, production: true }), 'http://0.0.0.0:3000');
  // Desenvolvimento local continua em localhost.
  assert.equal(publicOrigin({ host: 'localhost:3000', requestUrl: 'http://localhost:3000/r/X' }), 'http://localhost:3000');
});
