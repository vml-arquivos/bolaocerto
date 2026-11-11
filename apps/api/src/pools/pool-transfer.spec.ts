import { destinationBlocker, freeSlots, gamesSignature, planTransfer, sourceBlocker, type TransferPool } from './pool-transfer';

const now = new Date('2026-11-10T12:00:00Z');
const base = (over: Partial<TransferPool> = {}): TransferPool => ({ id: 'a', status: 'aberto', concursoId: 'c1', valorCota: '20.00', taxaAdministracaoPct: '10.00', totalCotas: 10, cotasIlimitadas: false, cotasVendidas: 0, maxCotasPorPessoa: null, jogos: [{ numeros: [1, 2, 3, 4, 5, 6] }], concurso: { dataSorteio: new Date('2026-11-20T23:00:00Z') }, ...over });
const shares = [{ id: 's1', compradorId: 'u1', quantidade: 2 }, { id: 's2', compradorId: 'u2', quantidade: 1 }];

describe('transferência de cotistas: regras', () => {
  it('assinatura dos jogos ignora a ordem das dezenas e dos jogos', () => {
    expect(gamesSignature([{ numeros: [6, 5, 4, 3, 2, 1] }, { numeros: [7, 8] }])).toBe(gamesSignature([{ numeros: [7, 8] }, { numeros: [1, 2, 3, 4, 5, 6] }]));
    expect(gamesSignature([{ numeros: [1, 2] }])).not.toBe(gamesSignature([{ numeros: [1, 3] }]));
  });
  it('origem: só aberto ou fechado e antes do sorteio', () => {
    expect(sourceBlocker(base(), now)).toBeNull();
    expect(sourceBlocker(base({ status: 'fechado' }), now)).toBeNull();
    expect(sourceBlocker(base({ status: 'registrado' }), now)).toContain('registrado');
    expect(sourceBlocker(base({ status: 'rascunho' }), now)).toContain('aberto ou fechado');
    expect(sourceBlocker(base({ concurso: { dataSorteio: new Date('2026-11-09T00:00:00Z') } }), now)).toContain('sorteio');
  });
  it('destino: mesmo concurso, valor e taxa; bolão não registrado', () => {
    const source = base();
    expect(destinationBlocker(source, base({ id: 'b' }), now)).toBeNull();
    expect(destinationBlocker(source, base({ id: 'b', concursoId: 'c2' }), now)).toContain('mesmo concurso');
    expect(destinationBlocker(source, base({ id: 'b', valorCota: '25.00' }), now)).toContain('valor');
    expect(destinationBlocker(source, base({ id: 'b', valorCota: 20 }), now)).toBeNull();
    expect(destinationBlocker(source, base({ id: 'b', taxaAdministracaoPct: '12' }), now)).toContain('taxa');
    expect(destinationBlocker(source, base({ id: 'b', status: 'registrado' }), now)).toContain('registrado');
    expect(destinationBlocker(source, base(), now)).toContain('diferente');
  });
  it('vagas: ilimitado não tem teto; limitado conta as livres', () => {
    expect(freeSlots(base({ cotasIlimitadas: true }))).toBeNull();
    expect(freeSlots(base({ totalCotas: 10, cotasVendidas: 7 }))).toBe(3);
    expect(freeSlots(base({ totalCotas: 5, cotasVendidas: 9 }))).toBe(0);
  });
  it('plano ok: soma cotas e pessoas', () => {
    const plan = planTransfer({ source: base(), dest: base({ id: 'b' }), shares, heldInDest: new Map(), now });
    expect(plan).toMatchObject({ cotas: 3, pessoas: 2, erros: [], jogosDiferentes: false });
  });
  it('plano recusa falta de vaga, limite por pessoa, jogos diferentes e lista vazia', () => {
    expect(planTransfer({ source: base(), dest: base({ id: 'b', totalCotas: 4, cotasVendidas: 2 }), shares, heldInDest: new Map(), now }).erros[0]).toContain('2 cotas livres');
    expect(planTransfer({ source: base(), dest: base({ id: 'b', maxCotasPorPessoa: 2 }), shares, heldInDest: new Map([['u2', 2]]), now }).erros.join(' ')).toContain('1 pessoa passaria do limite de 2');
    const diff = base({ id: 'b', jogos: [{ numeros: [9, 8, 7, 6, 5, 4] }] });
    expect(planTransfer({ source: base(), dest: diff, shares, heldInDest: new Map(), now }).erros.join(' ')).toContain('Confirme');
    const confirmed = planTransfer({ source: base(), dest: diff, shares, heldInDest: new Map(), confirmarJogosDiferentes: true, now });
    expect(confirmed.erros).toEqual([]); expect(confirmed.avisos.length).toBe(1);
    expect(planTransfer({ source: base(), dest: base({ id: 'b' }), shares: [], heldInDest: new Map(), now }).erros).toContain('Não há cotas pagas para transferir.');
  });
});
