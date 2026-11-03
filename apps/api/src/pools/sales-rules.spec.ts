import { ConflictException } from '@nestjs/common';
import { parseSalesRules, remainingForPerson, saleWindow, saleWindowMessage } from './sales-rules';

const cutoff = new Date('2026-12-31T22:00:00-03:00');

describe('parseSalesRules', () => {
  it('aceita janela dentro do prazo e normaliza o texto', () => {
    const rules = parseSalesRules({ vendaInicioEm: '2026-11-01T09:00:00-03:00', vendaFimEm: '2026-12-30T12:00:00-03:00', maxCotasPorPessoa: 10, regrasVenda: '  Pagamento em até 15 min.  ' }, { cutoffAt: cutoff, totalCotas: 100 });
    expect(rules.vendaInicioEm?.toISOString()).toBe('2026-11-01T12:00:00.000Z');
    expect(rules.maxCotasPorPessoa).toBe(10);
    expect(rules.regrasVenda).toBe('Pagamento em até 15 min.');
  });
  it('fim da venda não pode passar do prazo do concurso', () => {
    expect(() => parseSalesRules({ vendaFimEm: '2027-01-02T00:00:00-03:00' }, { cutoffAt: cutoff, totalCotas: 10 })).toThrow(ConflictException);
  });
  it('início precisa vir antes do fim (inclusive contra o valor já salvo)', () => {
    expect(() => parseSalesRules({ vendaInicioEm: '2026-12-20T00:00:00-03:00', vendaFimEm: '2026-12-10T00:00:00-03:00' }, { cutoffAt: cutoff, totalCotas: 10 })).toThrow(/antes do fim/);
    expect(() => parseSalesRules({ vendaInicioEm: '2026-12-20T00:00:00-03:00' }, { cutoffAt: cutoff, totalCotas: 10, current: { vendaFimEm: new Date('2026-12-10T00:00:00-03:00') } })).toThrow(/antes do fim/);
  });
  it('limite por pessoa não pode passar do total de cotas', () => {
    expect(() => parseSalesRules({ maxCotasPorPessoa: 11 }, { cutoffAt: cutoff, totalCotas: 10 })).toThrow(/limite por pessoa/);
    expect(parseSalesRules({ maxCotasPorPessoa: 11 }, { cutoffAt: cutoff, totalCotas: null }).maxCotasPorPessoa).toBe(11);
  });
  it('null limpa a regra e ausente não mexe', () => {
    const rules = parseSalesRules({ vendaInicioEm: null, regrasVenda: '' }, { cutoffAt: cutoff, totalCotas: 10 });
    expect(rules.vendaInicioEm).toBeNull(); expect(rules.regrasVenda).toBeNull(); expect('maxCotasPorPessoa' in rules).toBe(false);
  });
  it('data inválida é recusada', () => {
    expect(() => parseSalesRules({ vendaInicioEm: 'ontem' }, { cutoffAt: cutoff, totalCotas: 10 })).toThrow(/inválida/);
  });
});

describe('saleWindow', () => {
  const now = new Date('2026-11-10T12:00:00Z');
  it('sem datas está sempre aberta', () => { expect(saleWindow({}, now)).toBe('aberta'); expect(saleWindowMessage({}, now)).toBeNull(); });
  it('antes do início: em breve, com a data na mensagem', () => {
    const pool = { vendaInicioEm: new Date('2026-11-20T12:00:00Z') };
    expect(saleWindow(pool, now)).toBe('em_breve'); expect(saleWindowMessage(pool, now)).toMatch(/começa em .*2026|começa em/);
  });
  it('no instante do fim já está encerrada', () => {
    expect(saleWindow({ vendaFimEm: now }, now)).toBe('encerrada');
    expect(saleWindowMessage({ vendaFimEm: new Date('2026-11-01T00:00:00Z') }, now)).toMatch(/encerrada/);
  });
});

describe('remainingForPerson', () => {
  it('calcula o que falta e nunca fica negativo', () => {
    expect(remainingForPerson(5, 2)).toBe(3); expect(remainingForPerson(5, 9)).toBe(0); expect(remainingForPerson(null, 3)).toBeNull(); expect(remainingForPerson(undefined, 3)).toBeNull();
  });
});
