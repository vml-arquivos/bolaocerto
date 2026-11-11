import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const wizard = readFileSync(new URL('../components/pool-wizard.tsx', import.meta.url), 'utf8');
const affiliate = readFileSync(new URL('../components/affiliate-dashboard.tsx', import.meta.url), 'utf8');
const poolPage = readFileSync(new URL('../app/boloes/[id]/page.tsx', import.meta.url), 'utf8');

test('assistente de bolão oferece os três modos de preço para admin e afiliado', () => {
  assert.match(wizard, /% sobre o total do registro/);
  assert.match(wizard, /Registro ÷ cotas \+ % em cada cota/);
  assert.match(wizard, /Eu defino o valor da cota/);
  assert.match(wizard, /const modalMode = role === 'affiliate' && !editing && canPrice/);
  assert.match(wizard, /const modeUi = freeMode \|\| modalMode/);
});

test('bolão sem números: só a quantidade de números e de jogos, custo pela tabela da CAIXA', () => {
  assert.match(wizard, /dezenasPrevistas: plannedSizeNumber, jogosPrevistos: plannedGamesNumber/);
  assert.match(wizard, /Números ainda não definidos/);
  assert.match(wizard, /\{modeUi && <label className="admin-toggle-row admin-field-wide"><input type="checkbox" checked=\{numbersLater\}/);
});

test('o servidor recebe o modo e a porcentagem para refazer a conta', () => {
  assert.match(wizard, /modoPreco: plan\.modoPreco/);
  assert.match(wizard, /precoPct: plan\.precoPct/);
});

test('festa (com ou sem número oficial) aparece na lista de concursos do assistente, vinda do servidor por modalidade', () => {
  assert.match(wizard, /status: 'bolao', modalidade: modality/);
  assert.doesNotMatch(wizard, /contest\.numeroDefinido !== false/, 'festa sem número oficial não é mais escondida');
  assert.match(wizard, /query\.set\('busca'/);
  assert.match(wizard, /query\.set\('mes'/);
  assert.match(wizard, /dateAndTime\(contest\.dataSorteio\)/, 'mostra dia e hora do sorteio');
});

test('afiliado define os números do próprio bolão e a página mostra o aviso sem números', () => {
  assert.match(affiliate, /\/api\/v1\/afiliados\/me\/boloes\/\$\{definingPool\.id\}\/numeros/);
  assert.match(poolPage, /Os números deste bolão ainda não foram definidos/);
});
