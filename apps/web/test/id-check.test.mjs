import { test } from 'node:test';
import assert from 'node:assert/strict';
import { digitStream, findInText, finalReading, imageStats, nameMatch, qualityVerdict } from '../lib/id-check.ts';

const expected = { nome: 'Maria da Conceição Silva', cpf: '529.982.247-25', rg: '1.234.567', nascimento: '1990-05-10' };

test('acha nome, CPF, RG e nascimento num texto de CNH lido com erros comuns', () => {
  const ocr = `REPUBLICA FEDERATIVA DO BRASIL
  NOME MARIA DA CONCEICA0 SILVA
  DOC. IDENTIDADE / ORG. EMISSOR / UF 1234567 SSP DF
  CPF 529.982.247-2S DATA NASCIMENTO 10/05/199O`;
  assert.deepEqual(findInText(ocr, expected), { nome: true, cpf: true, rg: true, nascimento: true });
});

test('não acha o que não está no documento', () => {
  const found = findInText('NOME JOAO PEREIRA CPF 111.444.777-35 NASC 01/01/1980', expected);
  assert.deepEqual(found, { nome: false, cpf: false, rg: false, nascimento: false });
});

test('troca letras por números só em trechos numéricos', () => {
  assert.equal(digitStream('SILVA 12O.45I'), '120451');
  assert.equal(digitStream('SOLTEIRO'), '');
});

test('nome: aceita uma letra errada nas partes longas e exige a maioria das partes', () => {
  assert.equal(nameMatch('MARIA CONCEICAO SILVA', 'Maria da Conceição Silva').ok, true);
  assert.equal(nameMatch('MARlA SlLVA', 'Maria Silva').ok, true);
  assert.equal(nameMatch('MARCOS SOUZA', 'Maria Silva').ok, false);
  assert.equal(nameMatch('MARIA SOUZA', 'Maria da Conceição Silva').ok, false);
});

test('qualidade da foto: pequena, escura, estourada, tremida', () => {
  assert.equal(qualityVerdict({ largura: 400, altura: 300, brilho: 120, nitidez: 200 }).ok, false);
  assert.match(qualityVerdict({ largura: 2000, altura: 1200, brilho: 20, nitidez: 200 }).motivo, /escura/);
  assert.match(qualityVerdict({ largura: 2000, altura: 1200, brilho: 245, nitidez: 200 }).motivo, /clara/);
  assert.match(qualityVerdict({ largura: 2000, altura: 1200, brilho: 120, nitidez: 5 }).motivo, /tremida/);
  assert.equal(qualityVerdict({ largura: 2000, altura: 1200, brilho: 120, nitidez: 200 }).ok, true);
});

test('nitidez: imagem lisa tem zero, xadrez tem muita', () => {
  const w = 20, h = 20;
  const flat = new Uint8Array(w * h).fill(128);
  const board = Uint8Array.from({ length: w * h }, (_, i) => ((i % w) + Math.floor(i / w)) % 2 ? 255 : 0);
  assert.equal(imageStats(flat, w, h).nitidez, 0);
  assert.ok(imageStats(board, w, h).nitidez > 10000);
  assert.equal(imageStats(flat, w, h).brilho, 128);
});

test('resultado: foto boa mas leitura ruim pede outra foto', () => {
  const none = { nome: false, cpf: false, rg: null, nascimento: false };
  const bad = finalReading({ largura: 2000, altura: 1200, brilho: 120, nitidez: 200, confianca: 20, achou: none, ocr: true });
  assert.equal(bad.legivel, false);
  assert.match(bad.motivo, /outra foto/);
  const ok = finalReading({ largura: 2000, altura: 1200, brilho: 120, nitidez: 200, confianca: 30, achou: { ...none, cpf: true, nome: true }, ocr: true });
  assert.equal(ok.legivel, true);
});
