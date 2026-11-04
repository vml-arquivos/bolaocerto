import { BadRequestException } from '@nestjs/common';
import { OperationService } from './operation.service';

const games = [{ ordem: 1, numeros: [3, 12, 24, 36, 47, 58] }];

function setup() {
  const tx = {
    $queryRaw: jest.fn(),
    bolao: {
      findUniqueOrThrow: jest.fn().mockResolvedValue({ id: 'b1', status: 'fechado', cotas: [{ id: 'c1', status: 'paga', compradorId: 'u1' }], jogos: games }),
      update: jest.fn().mockResolvedValue({ id: 'b1', status: 'registrado', comprovanteUrl: null, registradoEm: new Date() }),
    },
    cota: { updateMany: jest.fn() },
    notificacao: { create: jest.fn() },
  };
  const prisma = {
    bolao: { findUnique: jest.fn().mockResolvedValue({ id: 'b1', status: 'fechado', concursoId: 'k1', cotas: [{ id: 'c1', status: 'paga' }] }) },
    anexo: { count: jest.fn().mockResolvedValue(1) },
    jogoBolao: { findMany: jest.fn().mockResolvedValue(games) },
    concurso: { findUnique: jest.fn().mockResolvedValue({ modalidade: 'megasena' }) },
    $transaction: jest.fn(async (fn: (client: typeof tx) => unknown) => fn(tx)),
  };
  const service = new OperationService(prisma as never, { record: jest.fn() } as never);
  return { service, tx };
}

describe('registro da aposta: o comprovante precisa ter exatamente os números do bolão', () => {
  const user = { id: 'op1' } as never;
  it('recusa sem digitar os jogos do comprovante', async () => {
    const { service, tx } = setup();
    await expect(service.register('b1', {}, user)).rejects.toBeInstanceOf(BadRequestException);
    expect(tx.bolao.update).not.toHaveBeenCalled();
  });
  it('recusa quando um número é diferente', async () => {
    const { service, tx } = setup();
    await expect(service.register('b1', { jogosConferidos: [[3, 12, 24, 36, 47, 59]] }, user)).rejects.toThrow(/não bate/);
    expect(tx.bolao.update).not.toHaveBeenCalled();
    expect(tx.cota.updateMany).not.toHaveBeenCalled();
  });
  it('registra quando os números batem', async () => {
    const { service, tx } = setup();
    await service.register('b1', { jogosConferidos: [[58, 47, 36, 24, 12, 3]], codigoBilhete: 'ABC' }, user);
    expect(tx.bolao.update).toHaveBeenCalled();
    expect(tx.cota.updateMany).toHaveBeenCalled();
  });
});
