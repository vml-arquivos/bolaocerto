import { UnauthorizedException } from '@nestjs/common';
import { NfseWebhookController } from './nfse.controller';

function controller(secret: string) {
  const nfse = { handleFocusWebhook: jest.fn().mockResolvedValue({ ok: true, atualizada: true }) };
  const config = { get: jest.fn((key: string, fallback = '') => (key === 'NFSE_FOCUS_WEBHOOK_SECRET' ? secret : fallback)) };
  return { nfse, controller: new NfseWebhookController(nfse as never, config as never) };
}

describe('webhook da Focus NFe', () => {
  it('sem segredo configurado, aceita e reconsulta a nota', async () => {
    const { controller: c, nfse } = controller('');
    expect(await c.focus({ ref: 'bl-1' })).toEqual({ ok: true, atualizada: true });
    expect(nfse.handleFocusWebhook).toHaveBeenCalledWith({ ref: 'bl-1' });
  });

  it('com segredo, recusa cabeçalho ausente ou errado e aceita o certo', async () => {
    const { controller: c, nfse } = controller('segredo-longo-123');
    expect(() => c.focus({ ref: 'bl-1' })).toThrow(UnauthorizedException);
    expect(() => c.focus({ ref: 'bl-1' }, 'errado')).toThrow(UnauthorizedException);
    expect(nfse.handleFocusWebhook).not.toHaveBeenCalled();
    expect(await c.focus({ ref: 'bl-1' }, 'segredo-longo-123')).toEqual({ ok: true, atualizada: true });
  });
});
