import { linkAffiliateClients } from './affiliate-client-linker';

describe('cotista que comprou pelo afiliado vira cliente dele', () => {
  it('dá o afiliado de origem (o primeiro) e coloca no grupo do bolão ou no grupo principal do afiliado', async () => {
    const prisma = {
      cota: { findMany: jest.fn().mockResolvedValue([
        { compradorId: 'u1', afiliadoReferenciaId: 'wes', bolao: { grupo: { id: 'g-wes-2', afiliadoId: 'wes' } } },
        { compradorId: 'u2', afiliadoReferenciaId: 'wes', bolao: { grupo: { id: 'g-oficial', afiliadoId: null } } },
        { compradorId: 'u1', afiliadoReferenciaId: 'ana', bolao: { grupo: null } },
      ]) },
      usuario: { updateMany: jest.fn().mockImplementation(async ({ where }) => ({ count: where.id.in.length })) },
      grupo: { findMany: jest.fn().mockResolvedValue([{ id: 'g-wes-1', afiliadoId: 'wes' }, { id: 'g-wes-2', afiliadoId: 'wes' }, { id: 'g-ana', afiliadoId: 'ana' }]) },
      grupoMembro: { createMany: jest.fn().mockResolvedValue({ count: 3 }) },
    };
    const result = await linkAffiliateClients(prisma as any);
    expect(prisma.usuario.updateMany).toHaveBeenCalledWith({ where: { id: { in: ['u1', 'u2'] }, papel: 'cotista', indicadoPorAfiliadoId: null }, data: { indicadoPorAfiliadoId: 'wes' } });
    expect(prisma.usuario.updateMany).toHaveBeenCalledTimes(1);
    expect(prisma.grupoMembro.createMany).toHaveBeenCalledWith({ data: [{ grupoId: 'g-wes-2', usuarioId: 'u1' }, { grupoId: 'g-wes-1', usuarioId: 'u2' }, { grupoId: 'g-ana', usuarioId: 'u1' }], skipDuplicates: true });
    expect(result).toEqual({ clientes: 2, membros: 3 });
    expect(prisma.cota.findMany.mock.calls[0][0].where.comprador).toEqual({ papel: 'cotista' });
  });

  it('sem compras por afiliado não mexe em nada', async () => {
    const prisma = { cota: { findMany: jest.fn().mockResolvedValue([]) }, usuario: { updateMany: jest.fn() }, grupo: { findMany: jest.fn() }, grupoMembro: { createMany: jest.fn() } };
    expect(await linkAffiliateClients(prisma as any, new Date())).toEqual({ clientes: 0, membros: 0 });
    expect(prisma.usuario.updateMany).not.toHaveBeenCalled();
  });
});
