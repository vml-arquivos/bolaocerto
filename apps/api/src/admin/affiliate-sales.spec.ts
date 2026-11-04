import { NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';

function setup(rows: unknown[]) {
  const prisma = {
    afiliado: { findUnique: jest.fn().mockResolvedValue({ id: 'af1', codigoAfiliado: 'MARIA10' }) },
    cota: { groupBy: jest.fn().mockResolvedValue(rows) },
    bolao: { findMany: jest.fn().mockResolvedValue([
      { id: 'b1', status: 'aberto', valorCota: 20, criadoEm: new Date(), grupo: { nome: 'BL Oficial' }, concurso: { modalidade: 'megasena', numeroConcurso: 3081, dataSorteio: new Date('2026-11-04T22:00:00Z') } },
      { id: 'b2', status: 'aberto', valorCota: 10, criadoEm: new Date(), grupo: { nome: 'BL Oficial' }, concurso: { modalidade: 'quina', numeroConcurso: 7000, dataSorteio: new Date('2026-11-05T22:00:00Z') } },
    ]) },
  };
  return { service: new AdminService(prisma as never, { record: jest.fn() } as never), prisma };
}

describe('vendas do afiliado por bolão', () => {
  const user = { id: 'u1', papel: 'afiliado' } as never;

  it('soma cotas vendidas e reservadas por bolão e monta o link rastreado', async () => {
    const { service, prisma } = setup([
      { bolaoId: 'b1', status: 'paga', _sum: { quantidade: 3, valorPago: 60 }, _count: { _all: 2 } },
      { bolaoId: 'b1', status: 'registrada', _sum: { quantidade: 2, valorPago: 40 }, _count: { _all: 1 } },
      { bolaoId: 'b1', status: 'reservada', _sum: { quantidade: 1, valorPago: null }, _count: { _all: 1 } },
      { bolaoId: 'b2', status: 'reservada', _sum: { quantidade: 4, valorPago: null }, _count: { _all: 1 } },
    ]);
    const result = await service.affiliateSalesByPool(user);
    expect(result.totalCotasVendidas).toBe(5);
    expect(result.items[0]).toMatchObject({ bolaoId: 'b1', cotasVendidas: 5, cotasReservadas: 1, valorVendido: '100.00', link: '/r/MARIA10?bolao=b1' });
    expect(result.items[1]).toMatchObject({ bolaoId: 'b2', cotasVendidas: 0, cotasReservadas: 4 });
    // Só as cotas deste afiliado, sem canceladas nem estornadas.
    expect(prisma.cota.groupBy).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ afiliadoReferenciaId: 'af1', status: { notIn: ['cancelada', 'estornada'] } }) }));
  });

  it('sem vendas devolve lista vazia', async () => {
    const { service } = setup([]);
    expect(await service.affiliateSalesByPool(user)).toMatchObject({ totalCotasVendidas: 0, items: [] });
  });

  it('quem não é afiliado não vê nada', async () => {
    const { service, prisma } = setup([]);
    prisma.afiliado.findUnique.mockResolvedValue(null);
    await expect(service.affiliateSalesByPool(user)).rejects.toBeInstanceOf(NotFoundException);
  });
});
