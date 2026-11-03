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
