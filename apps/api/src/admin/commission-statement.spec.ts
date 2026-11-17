import { AdminService } from './admin.service';
import { buildCommissionStatement, statementRange, type StatementCommission } from './commission-statement';

const row = (over: Partial<StatementCommission> = {}): StatementCommission => ({
  id: 'c1', afiliadoId: 'a1', afiliadoNome: 'Maria', afiliadoCodigo: 'MARIA', chavePix: 'maria@pix', valor: 3.5, baseCalculo: 10, percentual: 35,
  status: 'pendente', criadoEm: new Date('2026-11-10T15:00:00Z'), pagoEm: null, lote: null, comprador: 'João', cotaId: 'q1',
  bolao: { modalidade: 'megasena', numeroConcurso: 2900, valorCota: '10.00' }, grupo: null, ...over,
});

describe('extrato de comissões por afiliado', () => {
  it('junta as comissões de cada cota numa linha por afiliado, com total, quantidade e extrato', () => {
    const data = buildCommissionStatement([
      row(),
      row({ id: 'c2', cotaId: 'q2', valor: 7, criadoEm: new Date('2026-10-05T12:00:00Z') }),
      row({ id: 'c3', afiliadoId: 'a2', afiliadoNome: 'Ana', afiliadoCodigo: 'ANA', valor: 20 }),
      row({ id: 'c4', valor: 1.5, lote: { id: 'l1', codigo: 'REP-1', status: 'rascunho' } }),
    ]);
    expect(data.total).toBe('32.00');
    expect(data.quantidade).toBe(4);
    expect(data.afiliados.map((item) => [item.nome, item.total, item.quantidade])).toEqual([['Ana', '20.00', 1], ['Maria', '12.00', 3]]);
    const maria = data.afiliados[1]!;
    expect(maria.livre).toBe('10.50');
    expect(maria.emLote).toBe('1.50');
    expect(maria.idsLivres).toEqual(['c1', 'c2']);
    expect(maria.meses).toEqual([{ mes: '2026-11', total: '5.00', quantidade: 2 }, { mes: '2026-10', total: '7.00', quantidade: 1 }]);
    expect(maria.itens[0]).toMatchObject({ valor: '3.50', percentual: '35.00', baseCalculo: '10.00', comprador: 'João' });
    expect((maria.itens.at(-1) as { id: string }).id).toBe('c2');
  });

  it('sem comissões: total zerado e lista vazia', () => {
    expect(buildCommissionStatement([])).toEqual({ total: '0.00', quantidade: 0, afiliados: [] });
  });

  it('mês e período viram intervalo no horário de Brasília (o período mais estreito vale)', () => {
    expect(statementRange({ mes: '2026-12' })).toEqual({ gte: new Date('2026-12-01T03:00:00Z'), lt: new Date('2027-01-01T03:00:00Z') });
    expect(statementRange({ de: '2026-11-05', ate: '2026-11-10' })).toEqual({ gte: new Date('2026-11-05T03:00:00Z'), lt: new Date('2026-11-11T03:00:00Z') });
    expect(statementRange({ mes: '2026-11', de: '2026-11-20' })).toEqual({ gte: new Date('2026-11-20T03:00:00Z'), lt: new Date('2026-12-01T03:00:00Z') });
    expect(statementRange({})).toEqual({});
  });

  it('serviço filtra por situação, afiliado e data (venda ou pagamento) e devolve o resumo de cada aba', async () => {
    const findMany = jest.fn().mockResolvedValue([{
      id: 'c1', afiliadoId: 'a1', cotaId: 'q1', valor: { toString: () => '4' } as unknown, baseCalculo: 10, percentual: 40, status: 'paga', criadoEm: new Date('2026-11-02T12:00:00Z'), pagoEm: new Date('2026-11-03T12:00:00Z'), repassadoEm: null,
      afiliado: { codigoAfiliado: 'MARIA', chavePixRepasse: null, usuario: { nome: 'Maria' } }, loteRepasse: { id: 'l1', codigo: 'REP-1', status: 'pago' },
      cota: { titularNome: 'João', comprador: null, bolao: { valorCota: 10, concurso: { modalidade: 'megasena', numeroConcurso: 2900 }, grupo: null } },
    }].map((item) => ({ ...item, valor: 4 })));
    const prisma = {
      comissao: { findMany, groupBy: jest.fn().mockResolvedValue([{ status: 'paga', _sum: { valor: 4 }, _count: { _all: 1 } }, { status: 'pendente', _sum: { valor: 9.5 }, _count: { _all: 3 } }]) },
      afiliado: { findMany: jest.fn().mockResolvedValue([{ id: 'a2', codigoAfiliado: 'ZE', usuario: { nome: 'Zé' } }, { id: 'a1', codigoAfiliado: 'MARIA', usuario: { nome: 'Maria' } }]) },
    };
    const service = new AdminService(prisma as any, { record: jest.fn() } as any);
    const result = await service.commissionStatement({ status: 'paga', afiliadoId: '7d3c3f1e-1111-4111-8111-111111111111', mes: '2026-11', data: 'pagamento' });
    const where = findMany.mock.calls[0][0].where;
    expect(where).toMatchObject({ status: 'paga', afiliadoId: '7d3c3f1e-1111-4111-8111-111111111111', pagoEm: { gte: new Date('2026-11-01T03:00:00Z'), lt: new Date('2026-12-01T03:00:00Z') } });
    expect(where.criadoEm).toBeUndefined();
    expect(result.resumo).toEqual({ pendente: { total: '9.50', quantidade: 3 }, paga: { total: '4.00', quantidade: 1 }, cancelada: { total: '0.00', quantidade: 0 } });
    expect(result.afiliados[0]).toMatchObject({ nome: 'Maria', total: '4.00', quantidade: 1 });
    expect(result.afiliados[0]!.itens[0]).toMatchObject({ comprador: 'João', lote: { codigo: 'REP-1' } });
    expect(result.opcoesAfiliados.map((item) => item.nome)).toEqual(['Maria', 'Zé']);
    expect(result.filtros.data).toBe('pagamento');

    await service.commissionStatement({ mes: '2026-11' });
    expect(findMany.mock.calls[1][0].where).toMatchObject({ status: 'pendente', criadoEm: { gte: new Date('2026-11-01T03:00:00Z') } });
  });
});
