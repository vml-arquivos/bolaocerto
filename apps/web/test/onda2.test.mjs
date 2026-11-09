import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('login com Google: botão só no cadastro e entrada de cliente, nunca em convite de afiliado ou equipe', async () => {
  const shell = await read('components/auth-shell.tsx');
  assert.match(shell, /audience === 'cliente' && \(!invite \|\| invite\.tipo === 'cliente' \|\| invite\.tipo === 'indicacao'\)/);
  const button = await read('components/google-button.tsx');
  assert.ok(button.includes('/api/v1/auth/google/config'));
  assert.ok(button.includes('/api/v1/auth/google'));
  assert.ok(button.includes('hidden={!active && !message}'), 'sem GOOGLE_CLIENT_ID nada aparece');
});

test('login com Google: primeiro acesso passa por CPF, telefone e os três aceites', async () => {
  const form = await read('components/google-signup-form.tsx');
  for (const field of ['name="cpf"', 'name="telefone"', 'name="aceiteTermos"', 'name="aceitePrivacidade"', 'name="maiorDeIdade"']) assert.ok(form.includes(field), field);
  assert.ok(form.includes('/api/v1/auth/google/cadastro'));
  assert.ok(await read('app/cadastro/google/page.tsx'));
});

test('conferidor de jogos fica em Resultados e fala com a API pública', async () => {
  const page = await read('app/resultados/page.tsx');
  assert.match(page, /<GameChecker \/>/);
  const checker = await read('components/game-checker.tsx');
  assert.ok(checker.includes('/api/v1/conferidor'));
  assert.ok(checker.includes('Nada fica guardado'));
});

test('comparador de bolões: página, menu do site e menu "Mais" do aplicativo', async () => {
  assert.ok((await read('app/boloes/comparar/page.tsx')).includes('/boloes/disponiveis'));
  assert.ok((await read('components/site-header.tsx')).includes('/boloes/comparar'));
  assert.ok((await read('app/aplicativo/mais/page.tsx')).includes('/boloes/comparar'));
  const compare = await read('components/pool-compare.tsx');
  for (const label of ['Menor valor da cota', 'Menor taxa de serviço', 'Mais cotas livres', 'Sorteio mais próximo']) assert.ok(compare.includes(label), label);
});

test('avise-me por jogo está na área "Minha conta"', async () => {
  assert.ok((await read('components/account-dashboard.tsx')).includes('<ModalityAlertsCard />'));
  assert.ok((await read('components/modality-alerts-card.tsx')).includes('/api/v1/usuarios/me/alertas-bolao'));
});

test('painel de saúde mostra as exceções novas', async () => {
  const health = await read('components/admin-health.tsx');
  for (const text of ['faixasEspeciais', 'pagamentosFalhos', 'premiosSemAviso', 'Time do Coração / Mês de Sorte para conferir']) assert.ok(health.includes(text), text);
});

test('texto do modelo operacional: registra nos canais oficiais da CAIXA, em lotérica credenciada ou na própria CAIXA', async () => {
  const notice = await read('components/aviso-nao-registra.tsx');
  assert.match(notice, /lotérica credenciada ou na própria CAIXA/);
  assert.ok(!notice.includes('por mandato dos cotistas'));
});
