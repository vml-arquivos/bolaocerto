import { assertCommissionCeiling, DEFAULT_RULES, effectiveLimit, normalizeLevel, normalizeRules } from './affiliate-rules';

const store = (rules: unknown) => ({ configuracaoSistema: { findUnique: jest.fn(async () => (rules === null ? null : { valor: JSON.stringify(rules) })) } });

describe('regras dos afiliados', () => {
  it('padrão: Bronze 25/R$80, Prata 35/R$100, Ouro 50/R$150, Diamante 100/R$200 e comissão travada em 35%', () => {
    expect(normalizeRules(null)).toEqual(DEFAULT_RULES);
    expect(DEFAULT_RULES.niveis).toEqual({ bronze: { maxCotas: 25, maxValorCota: 80 }, prata: { maxCotas: 35, maxValorCota: 100 }, ouro: { maxCotas: 50, maxValorCota: 150 }, diamante: { maxCotas: 100, maxValorCota: 200 } });
    expect(DEFAULT_RULES.comissaoMaxPct).toBe(35);
    expect(DEFAULT_RULES.comissaoTravada).toBe(true);
    expect(normalizeLevel(null).nivel).toBe('bronze');
  });
  it('nível inválido volta para Bronze; limite manual vale no lugar do nível', () => {
    expect(normalizeLevel({ nivel: 'platina' }).nivel).toBe('bronze');
    expect(effectiveLimit(DEFAULT_RULES, normalizeLevel({ nivel: 'ouro' }))).toMatchObject({ maxCotas: 50, maxValorCota: 150, origem: 'nivel' });
    expect(effectiveLimit(DEFAULT_RULES, normalizeLevel({ nivel: 'ouro', manual: { maxCotas: 70, maxValorCota: 175 } }))).toMatchObject({ maxCotas: 70, maxValorCota: 175, origem: 'manual' });
  });
  it('comissão acima de 35% é recusada enquanto estiver travada', async () => {
    await expect(assertCommissionCeiling(store(null), 35)).resolves.toBeUndefined();
    await expect(assertCommissionCeiling(store(null), 35.01)).rejects.toThrow(/travada em no máximo 35%/);
  });
  it('a conta principal pode subir, baixar ou destravar o teto', async () => {
    await expect(assertCommissionCeiling(store({ comissaoMaxPct: 40, comissaoTravada: true }), 40)).resolves.toBeUndefined();
    await expect(assertCommissionCeiling(store({ comissaoMaxPct: 20, comissaoTravada: true }), 25)).rejects.toThrow(/20%/);
    await expect(assertCommissionCeiling(store({ comissaoMaxPct: 35, comissaoTravada: false }), 60)).resolves.toBeUndefined();
  });
  it('sem acesso às configurações (testes antigos) vale o padrão', async () => {
    await expect(assertCommissionCeiling({}, 50)).rejects.toThrow(/35%/);
  });
});
