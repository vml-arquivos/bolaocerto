import { ServiceUnavailableException } from '@nestjs/common';
import { PaymentsService } from './payments.service';

describe('PaymentsService', () => {
  it('mantém pagamentos desabilitados até o operador ativar o modo configurado', async () => {
    const service = new PaymentsService({} as any, {} as any, { get: jest.fn((_key: string, fallback: string) => fallback) } as any);
    await expect(service.createForShare('share-1', { metodo: 'pix' } as any, { id: 'user-1', papel: 'cotista' } as any)).rejects.toBeInstanceOf(ServiceUnavailableException);
  });
});
