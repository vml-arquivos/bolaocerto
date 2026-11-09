import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';

const read = (path) => readFile(new URL(`../${path}`, import.meta.url), 'utf8');

test('painel: Documentos fica em Administração e abre a tela de documentos', async () => {
  const shell = await read('components/admin-shell.tsx');
  const dashboard = await read('components/admin-dashboard.tsx');
  assert.match(shell, /\['documentos', 'Documentos', 'DC'\]/);
  assert.match(dashboard, /view === 'documentos'\) return <DocumentsView/);
  assert.match(dashboard, /selfLoadingViews = new Set\([^)]*'documentos'/);
});

test('painel: tela de documentos lista, publica, volta ao padrão e mostra o histórico', async () => {
  const view = await read('components/admin-documents.tsx');
  assert.ok(view.includes('/api/v1/admin/documentos'));
  assert.ok(view.includes('/publicar'));
  assert.ok(view.includes('/voltar-ao-padrao'));
  assert.ok(view.includes('Histórico de versões'));
  assert.ok(view.includes('Baixar .txt'));
});

test('aviso de que o Bolão Livre não registra jogos aparece no site, no aplicativo e no pagamento', async () => {
  const notice = await read('components/aviso-nao-registra.tsx');
  assert.ok(notice.includes('não registra jogos'));
  assert.ok(notice.includes('não é lotérica'));
  for (const file of ['components/site-header.tsx', 'components/client-footer.tsx', 'components/checkout.tsx']) {
    assert.ok((await read(file)).includes('<AvisoNaoRegistra'), `${file} deve mostrar o aviso`);
  }
});

test('senha: mínimo de 8 caracteres também no formulário de usuário criado pelo painel', async () => {
  const lib = await read('lib/password.ts');
  assert.match(lib, /PASSWORD_MIN = 8/);
  assert.match(lib, /Mínimo 8 caracteres/);
  const tools = await read('components/admin-people-tools.tsx');
  assert.ok(tools.includes('minLength={8}'));
  assert.ok(!tools.includes('mínimo 6'));
});

test('funil: etapas do navegador contadas uma vez por sessão e tela no painel', async () => {
  const beacon = await read('components/funnel-beacon.tsx');
  assert.ok(beacon.includes('sessionStorage'));
  assert.ok(beacon.includes('doNotTrack'));
  for (const [file, name] of [['app/page.tsx', 'visita_home'], ['app/boloes/[id]/page.tsx', 'bolao_visto'], ['components/auth-form.tsx', 'cadastro_iniciado']]) {
    assert.ok((await read(file)).includes(`<FunnelBeacon name="${name}"`), `${file} deve contar ${name}`);
  }
  assert.ok((await read('components/admin-dashboard.tsx')).includes("view === 'funil'"));
  assert.ok((await read('components/admin-shell.tsx')).includes("['funil', 'Funil de conversão'"));
});

test('carrossel: só oferece o botão quando há bolão aberto da modalidade', async () => {
  const page = await read('app/page.tsx');
  assert.ok(page.includes('sem bolão aberto agora'));
  assert.ok(page.includes("...(available > 0 ? { botao: 'Ver bolões', href: '#boloes' } : {})"));
});

test('pool wizard: Timemania e Dia de Sorte pedem Time do Coração / Mês de Sorte para a apuração conferir', async () => {
  const wizard = await read('components/pool-wizard.tsx');
  assert.ok(wizard.includes('Time do Coração dos jogos'));
  assert.ok(wizard.includes('mesSorte'));
  assert.ok(wizard.includes('payload.avisos'));
});
