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
      grupo: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'g1' }) }, grupoMembro: { upsert: jest.fn().mockResolvedValue({}) }, notificacao: { create: jest.fn().mockResolvedValue({}) },
    };
    const prisma = {
      afiliado: { findUnique: jest.fn().mockResolvedValue({ id: 'affiliate-1', usuarioId: 'user-1', statusAprovacao: 'pendente', usuario: { id: 'user-1', nome: 'Maria Souza' } }) },
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
    const prisma = { concurso: { findUnique: jest.fn() }, afiliado: { findUnique: jest.fn().mockResolvedValue(null) } };
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

describe('AdminService — somas no banco', () => {
  it('concilia o financeiro sem carregar todos os pagamentos', async () => {
    const prisma = {
      pagamento: {
        aggregate: jest.fn().mockResolvedValue({ _sum: { valorBruto: '110.00', valorTaxaAdmin: '10.00', valorCustoBilhete: '100.00', valorComissaoAfiliado: '2.00' } }),
        count: jest.fn().mockResolvedValue(0),
        findMany: jest.fn(),
      },
      cota: { count: jest.fn().mockResolvedValue(0) },
    };
    const audit = { record: jest.fn() };
    const service = new AdminService(prisma as any, audit as any);

    const result = await service.financialReconciliation({ id: 'admin-1', papel: 'admin' } as any);

    expect(prisma.pagamento.findMany).not.toHaveBeenCalled();
    expect(prisma.pagamento.aggregate).toHaveBeenCalledWith(expect.objectContaining({ where: { status: 'confirmado' } }));
    expect(result).toEqual(expect.objectContaining({ valorArrecadado: '110.00', taxaAdministracao: '10.00', custoBilhetes: '100.00', comissoes: '2.00', resultadoLiquidoPlataforma: '8.00', conciliado: true }));
  });

  it('painel do afiliado soma comissões por status no banco', async () => {
    const prisma = {
      afiliado: { findUnique: jest.fn().mockResolvedValue({ id: 'a1', codigoAfiliado: 'ABC', statusAprovacao: 'aprovado', _count: { cotasReferenciadas: 3, usuariosIndicados: 2, comissoes: 4 } }) },
      cota: { aggregate: jest.fn().mockResolvedValue({ _sum: { valorPago: '300.00' } }), findMany: jest.fn().mockResolvedValue([{ compradorId: 'u1' }, { compradorId: 'u2' }]) },
      comissao: { groupBy: jest.fn().mockResolvedValue([{ status: 'pendente', _sum: { valor: '12.50' } }, { status: 'paga', _sum: { valor: '30.00' } }]) },
    };
    const service = new AdminService(prisma as any, { record: jest.fn() } as any);

    const result = await service.affiliateDashboard({ id: 'u9', papel: 'afiliado' } as any);

    expect(result).toEqual(expect.objectContaining({ comissaoPendente: '12.50', comissaoPaga: '30.00', totalComissoes: 4, participantes: 2, cotas: 3, volume: '300.00' }));
  });
});
