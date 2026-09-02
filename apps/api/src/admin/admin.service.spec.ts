import { ConflictException, ForbiddenException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { PoolsService } from '../pools/pools.service';

function transactionMock(tx: any) {
  return jest.fn(async (callback: (client: any) => unknown) => callback(tx));
}

describe('AdminService', () => {
  it('aprova afiliado e sincroniza o papel do usuário na mesma transação', async () => {
    const tx = {
      afiliado: { update: jest.fn().mockResolvedValue({ id: 'affiliate-1', usuarioId: 'user-1', statusAprovacao: 'aprovado' }) },
      usuario: { update: jest.fn().mockResolvedValue({ id: 'user-1', papel: 'afiliado' }) },
    };
    const prisma = {
      afiliado: { findUnique: jest.fn().mockResolvedValue({ id: 'affiliate-1', usuarioId: 'user-1', statusAprovacao: 'pendente', usuario: { id: 'user-1' } }) },
      $transaction: transactionMock(tx),
    };
    const audit = { record: jest.fn() };
    const service = new AdminService(prisma as any, audit as any);

    await service.approveAffiliate('affiliate-1', { comissaoPadraoPct: 12 }, { id: 'admin-1', papel: 'admin' } as any);

    expect(tx.afiliado.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'affiliate-1' } }));
    expect(tx.usuario.update).toHaveBeenCalledWith({ where: { id: 'user-1' }, data: { papel: 'afiliado' } });
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ evento: 'afiliado.aprovado' }));
  });

  it('não cria lote com comissão ausente, paga ou já vinculada', async () => {
    const prisma = { comissao: { findMany: jest.fn().mockResolvedValue([{ id: 'commission-1' }]) } };
    const service = new AdminService(prisma as any, { record: jest.fn() } as any);

    await expect(service.createRemittance({ comissaoIds: ['commission-1', 'commission-2'] }, { id: 'admin-1', papel: 'admin' } as any)).rejects.toBeInstanceOf(ConflictException);
    expect(prisma.comissao.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ status: 'pendente', loteRepasseId: null }) }));
  });
});

describe('PoolsService', () => {
  it('bloqueia afiliado na criação de bolão antes de acessar o banco', async () => {
    const prisma = { concurso: { findUnique: jest.fn() } };
    const service = new PoolsService(prisma as any, { record: jest.fn() } as any);

    await expect(service.create({} as any, { id: 'affiliate-1', papel: 'afiliado' } as any)).rejects.toBeInstanceOf(ForbiddenException);
    expect(prisma.concurso.findUnique).not.toHaveBeenCalled();
  });

  it('normaliza jogos em ordem e rejeita ordem não sequencial', () => {
    const service = new PoolsService({} as any, {} as any) as any;
    const normalized = service.normalizeGames([{ ordem: 2, numeros: [12, 5, 5], custo: 2 }, { ordem: 1, numeros: [9, 1], custo: 1 }], [1]);
    expect(normalized).toEqual([
      { ordem: 1, numeros: [1, 9], quantidadeDezenas: 2, custo: 1 },
      { ordem: 2, numeros: [5, 12], quantidadeDezenas: 2, custo: 2 },
    ]);
    expect(() => service.normalizeGames([{ ordem: 2, numeros: [1, 2] }], [1])).toThrow(ConflictException);
  });
});
