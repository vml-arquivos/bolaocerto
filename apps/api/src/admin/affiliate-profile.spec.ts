import { AdminService } from './admin.service';

describe('ficha do afiliado', () => {
  const affiliate = {
    id: 'af1', usuarioId: 'u1', codigoAfiliado: 'BL-WES', statusAprovacao: 'aprovado', comissaoPadraoPct: { toFixed: () => '20.00' }, criadoEm: new Date('2026-11-01'), aprovadoEm: new Date('2026-11-02'), chavePixRepasse: null,
    dadosContrato: { rg: '1234567', rgOrgao: 'SSP', rgUf: 'DF', estadoCivil: 'solteiro(a)', profissao: 'Vendedor', nacionalidade: 'brasileiro(a)' },
    documentoIdentidade: null,
    usuario: { id: 'u1', nome: 'Wesley Pereira', email: 'w@x.com', cpf: '52998224725', telefone: '61999998888', dataNascimento: new Date('1990-05-10'), statusKyc: 'nao_iniciado', chavePixRecebimento: 'pix', criadoEm: new Date('2026-11-01'), desativadoEm: null, enderecoCep: '70000000', enderecoLogradouro: 'Rua A', enderecoNumero: '10', enderecoComplemento: null, enderecoBairro: 'Centro', enderecoCidade: 'Brasília', enderecoUf: 'DF' },
    parentAfiliado: null, indicados: [], grupos: [{ id: 'g1', nome: 'Grupo do Wesley', slug: 'grupo-wes', _count: { membros: 7 } }],
  };
  const sale = (buyer: string, nome: string, valor: number, day: number) => ({ compradorId: buyer, valorPago: valor, quantidade: 1, criadoEm: new Date(`2026-11-${String(day).padStart(2, '0')}T12:00:00Z`), comprador: { nome, email: `${buyer}@x.com` } });
  const prisma = {
    afiliado: { findUnique: jest.fn(async ({ where }: any) => (where.id === 'af1' ? affiliate : null)) },
    cota: { findMany: jest.fn(async () => [sale('c2', 'Bia', 36, 15), sale('c1', 'Ana', 36, 12), sale('c1', 'Ana', 36, 10)]) },
    comissao: {
      findMany: jest.fn(async () => [{ id: 'k1', valor: { toFixed: () => '7.20' }, percentual: { toFixed: () => '20.00' }, status: 'pendente', criadoEm: new Date(), pagoEm: null, cota: { titularNome: 'Ana', comprador: { nome: 'Ana' }, bolao: { concurso: { modalidade: 'megasena', numeroConcurso: 2950 } } } }]),
      groupBy: jest.fn(async () => [{ status: 'pendente', _sum: { valor: 14.4 }, _count: { _all: 2 } }, { status: 'paga', _sum: { valor: 7.2 }, _count: { _all: 1 } }]),
    },
    contrato: { findMany: jest.fn(async () => [{ id: 'ct1', numero: 'BLC-1', tipo: 'afiliado', titulo: 'Contrato', status: 'assinado', criadoEm: new Date(), assinadoEm: new Date(), empresaAssinadaEm: new Date(), canceladoEm: null }]) },
    usuario: { findMany: jest.fn(async () => [{ id: 'c1', indicadoPorAfiliadoId: 'af1' }]) },
    grupoMembro: { findMany: jest.fn(async () => [{ usuarioId: 'c3', grupo: { afiliadoId: 'af1' } }]) },
    configuracaoSistema: { findUnique: jest.fn(async () => null), findMany: jest.fn(async () => []) },
    aceiteLegal: { findFirst: jest.fn(async () => null) },
  };

  it('junta dados pessoais, vendas por cliente, comissões, grupos, contratos e documento', async () => {
    const service = new AdminService(prisma as any, { record: jest.fn() } as any);
    const ficha: any = await service.affiliateProfile('af1');
    expect(ficha.usuario).toMatchObject({ nome: 'Wesley Pereira', cpf: '529.982.247-25', cidade: 'Brasília/DF' });
    expect(ficha.usuario.endereco).toContain('Rua A, 10');
    expect(ficha.dadosContrato).toMatchObject({ rg: '1234567', rgOrgao: 'SSP/DF', estadoCivil: 'solteiro(a)' });
    expect(ficha.indicadores).toMatchObject({ compradores: 2, cotas: 3, vendido: '108.00', ticketMedio: '54.00', pendente: '14.40', paga: '7.20' });
    expect(ficha.maioresClientes[0]).toMatchObject({ id: 'c1', nome: 'Ana', cotas: 2, valor: '72.00' });
    expect(ficha.comissoes[0]).toMatchObject({ cliente: 'Ana', valor: '7.20', status: 'pendente' });
    expect(ficha.grupos).toEqual([{ id: 'g1', nome: 'Grupo do Wesley', slug: 'grupo-wes', membros: 7 }]);
    expect(ficha.contratos).toHaveLength(1);
    expect(ficha.documento.situacao).toBe('pendente');
    expect(ficha.nivel.nomeNivel).toBeTruthy();
  });

  it('afiliado que não existe dá erro claro', async () => {
    const service = new AdminService(prisma as any, { record: jest.fn() } as any);
    await expect(service.affiliateProfile('nada')).rejects.toThrow('Afiliado não encontrado');
  });
});
