import { evaluateReleaseGate } from './release-gate';

describe('evaluateReleaseGate', () => {
  it('bolão comum (sem gatilho) está sempre liberado', () => {
    const state = evaluateReleaseGate({ premioMinimoLiberacao: null, premioAtual: 5_000_000 });
    expect(state).toMatchObject({ condicional: false, liberado: true });
  });

  it('bloqueia enquanto o prêmio estimado está abaixo do gatilho', () => {
    const state = evaluateReleaseGate({ premioMinimoLiberacao: '100000000.00', premioAtual: '62000000.00' });
    expect(state.condicional).toBe(true);
    expect(state.liberado).toBe(false);
    expect(state.faltam).toBe(38_000_000);
    expect(state.progressoPct).toBe(62);
    expect(state.mensagem).toContain('ainda não liberadas');
  });

  it('bloqueia quando a CAIXA ainda não informou a estimativa', () => {
    expect(evaluateReleaseGate({ premioMinimoLiberacao: 100_000_000, premioAtual: null }).liberado).toBe(false);
  });

  it('libera exatamente no gatilho e acima dele', () => {
    expect(evaluateReleaseGate({ premioMinimoLiberacao: 100_000_000, premioAtual: 100_000_000 }).liberado).toBe(true);
    expect(evaluateReleaseGate({ premioMinimoLiberacao: 100_000_000, premioAtual: 130_000_000 }).progressoPct).toBe(100);
  });

  it('uma vez liberado (liberadoEm) permanece liberado mesmo se a estimativa cair', () => {
    expect(evaluateReleaseGate({ premioMinimoLiberacao: 100_000_000, premioAtual: 50_000_000, liberadoEm: new Date() }).liberado).toBe(true);
  });

  it('nunca mostra 100% antes de liberar', () => {
    expect(evaluateReleaseGate({ premioMinimoLiberacao: 100_000_000, premioAtual: 99_999_999 }).progressoPct).toBeLessThan(100);
  });
});
