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

describe('cotas do afiliado, uma a uma', () => {
  const user = { id: 'u1', papel: 'afiliado' } as never;
  function setupQuotas(rows: unknown[], total = rows.length) {
    const prisma = {
      afiliado: { findUnique: jest.fn().mockResolvedValue({ id: 'af1' }) },
      cota: { findMany: jest.fn().mockResolvedValue(rows), count: jest.fn().mockResolvedValue(total) },
    };
    return { service: new AdminService(prisma as never, { record: jest.fn() } as never), prisma };
  }
  const base = { id: 'c1', quantidade: 2, valorPago: 40, status: 'paga', criadoEm: new Date('2026-11-03T12:00:00Z'), titularNome: 'Maria da Silva Souza', bolao: { id: 'b1', valorCota: 20, concurso: { modalidade: 'megasena', numeroConcurso: 3081, dataSorteio: new Date('2026-11-04T22:00:00Z') } }, comissao: { valor: 1.2, status: 'pendente' } };

  it('mostra só o primeiro nome e a inicial do sobrenome, com a comissão da cota', async () => {
    const { service, prisma } = setupQuotas([base]);
    const result = await service.affiliateQuotas(user);
    expect(result.items[0]).toMatchObject({ comprador: 'Maria S.', quantidade: 2, valor: '40.00', status: 'paga', comissao: { valor: '1.20', status: 'pendente' }, modalidade: 'megasena', concurso: 3081 });
    // Nada de CPF, e-mail ou telefone no que é pedido ao banco.
    const select = (prisma.cota.findMany.mock.calls[0]![0] as { select: Record<string, unknown> }).select;
    expect(Object.keys(select)).not.toEqual(expect.arrayContaining(['titularCpf']));
    expect(JSON.stringify(result)).not.toMatch(/cpf|email|telefone/i);
    expect(prisma.cota.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { afiliadoReferenciaId: 'af1' }, take: 200 }));
  });

  it('cota ainda não paga mostra o valor a pagar e não tem comissão', async () => {
    const { service } = setupQuotas([{ ...base, id: 'c2', valorPago: null, status: 'reservada', titularNome: 'João', comissao: null }]);
    const result = await service.affiliateQuotas(user);
    expect(result.items[0]).toMatchObject({ comprador: 'João', valor: '40.00', status: 'reservada', comissao: null });
  });

  it('filtra por status válido e ignora status inventado', async () => {
    const a = setupQuotas([]);
    await a.service.affiliateQuotas(user, 'reservada');
    expect(a.prisma.cota.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { afiliadoReferenciaId: 'af1', status: 'reservada' } }));
    const b = setupQuotas([]);
    await b.service.affiliateQuotas(user, 'qualquer-coisa');
    expect(b.prisma.cota.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { afiliadoReferenciaId: 'af1' } }));
  });

  it('quem não é afiliado não vê nada', async () => {
    const { service, prisma } = setupQuotas([]);
    prisma.afiliado.findUnique.mockResolvedValue(null);
    await expect(service.affiliateQuotas(user)).rejects.toBeInstanceOf(NotFoundException);
  });
});
