import { hasSaleProof } from './proof';
describe('Pre-sale official proof', () => {
  it('requires a general, visible, active official attachment', async () => {
    const count = jest.fn().mockResolvedValue(0);
    expect(await hasSaleProof({ anexo: { count } } as any, 'pool')).toBe(false);
    expect(count).toHaveBeenCalledWith({ where: { bolaoId: 'pool', cotaId: null, removidoEm: null, visivelParticipantes: true, tipo: { in: ['comprovante_aposta', 'jogos_registrados'] } } });
    count.mockResolvedValue(1);
    expect(await hasSaleProof({ anexo: { count } } as any, 'pool')).toBe(true);
  });
});
