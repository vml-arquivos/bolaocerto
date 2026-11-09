import { ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma, StatusCota } from '@prisma/client';
import { AuthUser } from '../auth/auth.utils';
import { AffiliateCrmService } from './crm-afiliado.service';
import { CrmService } from './crm.service';

const NOW = new Date('2026-10-18T12:00:00Z');
const daysAgo = (days: number) => new Date(NOW.getTime() - days * 86_400_000);
const user = { id: 'afil-user', email: 'a@bl.com', papel: 'afiliado' } as AuthUser;

function build(status = 'aprovado') {
  const users = [
    { id: 'u1', nome: 'Ana Grande', cpf: '12345678909', email: 'ana@x.com', telefone: '61999990000', enderecoCidade: 'Brasília', enderecoUf: 'DF', papel: 'cotista', criadoEm: daysAgo(50), indicadoPorAfiliado: { codigoAfiliado: 'AF1' }, crmPerfil: { etiquetas: ['vip'], proximoContatoEm: daysAgo(-1) } },
    { id: 'u2', nome: 'Bruno Pequeno', cpf: '98765432100', email: 'bruno@x.com', telefone: null, enderecoCidade: null, enderecoUf: null, papel: 'cotista', criadoEm: daysAgo(10), indicadoPorAfiliado: null, crmPerfil: null },
  ];
  const paid = [{ compradorId: 'u1', bolaoId: 'b1', quantidade: 2, valorPago: new Prisma.Decimal(60), criadoEm: daysAgo(3), status: StatusCota.paga, valorPremio: null, pagamento: { valorBruto: new Prisma.Decimal(60), confirmadoEm: daysAgo(3) } }];
  const pending = [{ compradorId: 'u2', quantidade: 1, expiraReservaEm: daysAgo(-1), bolao: { valorCota: new Prisma.Decimal(30) } }];
  const prisma = {
    afiliado: { findUnique: jest.fn().mockResolvedValue({ id: 'aff-1', statusAprovacao: status }) },
    usuario: { findMany: jest.fn().mockResolvedValue(users) },
    cota: { findMany: jest.fn().mockImplementation(async ({ where }: any) => (where.status === StatusCota.reservada ? pending : paid)), groupBy: jest.fn().mockResolvedValue([]) },
    crmAfiliadoPerfil: {
      findMany: jest.fn().mockResolvedValue([{ afiliadoId: 'aff-1', usuarioId: 'u2', etiquetas: ['whatsapp'], nota: 'Prefere à noite', proximoContatoEm: daysAgo(-2) }]),
      upsert: jest.fn().mockImplementation(async ({ create }: any) => ({ etiquetas: create.etiquetas ?? [], nota: create.nota ?? null, proximoContatoEm: create.proximoContatoEm ?? null })),
    },
  };
  const crm = new CrmService(prisma as never, { record: jest.fn() } as never);
  return { service: new AffiliateCrmService(prisma as never, crm), prisma };
}

describe('AffiliateCrmService', () => {
  beforeAll(() => { jest.useFakeTimers({ now: NOW, doNotFake: ['nextTick', 'setImmediate', 'clearImmediate', 'setTimeout', 'clearTimeout', 'setInterval', 'clearInterval', 'queueMicrotask'] }); });
  afterAll(() => { jest.useRealTimers(); });

  it('só afiliado aprovado entra no CRM', async () => {
    const { service } = build('pendente');
    await expect(service.overview(user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('restringe a busca de clientes à carteira do afiliado', async () => {
    const { service, prisma } = build();
    await service.list({}, user);
    const where = prisma.usuario.findMany.mock.calls[0][0].where;
    expect(where.papel).toBe('cotista');
    expect(JSON.stringify(where.OR)).toContain('indicadoPorAfiliadoId');
    expect(JSON.stringify(where.OR)).toContain('aff-1');
    const cotaWhere = prisma.cota.findMany.mock.calls[0][0].where;
    expect(JSON.stringify(cotaWhere.OR)).toContain('afiliadoReferenciaId');
  });

  it('não mostra CPF nem as anotações da administração; usa as anotações do afiliado', async () => {
    const { service } = build();
    const result = await service.list({}, user);
    const ana = result.items.find((item: any) => item.nome === 'Ana Grande') as any;
    const bruno = result.items.find((item: any) => item.nome === 'Bruno Pequeno') as any;
    expect(ana.cpf).toBeUndefined();
    expect(ana.email).toBe('an***@x.com');
    expect(ana.etiquetas).toEqual([]);
    expect(ana.segmentos).not.toContain('vip');
    expect(bruno.etiquetas).toEqual(['whatsapp']);
    expect(bruno.nota).toBe('Prefere à noite');
    expect(bruno.etapa).toBe('reservou');
    expect(ana.etapa).toBe('pagou');
  });

  it('resumo traz o funil e quem chamar agora', async () => {
    const { service } = build();
    const overview = await service.overview(user);
    expect(overview.totais).toMatchObject({ clientes: 2, compradores: 1, receitaTotal: 60 });
    expect(overview.funil.totais).toMatchObject({ cadastrados: 2, jaPagaram: 1 });
    expect(overview.paraChamarAgora.map((row) => row.nome)).toEqual(['Bruno Pequeno']);
  });

  it('só edita cliente da própria carteira', async () => {
    const { service, prisma } = build();
    await expect(service.updateProfile('outro-usuario', { nota: 'x' }, user)).rejects.toBeInstanceOf(NotFoundException);
    const saved = await service.updateProfile('u1', { etiquetas: [' Quente ', 'quente'], nota: ' ligar ', proximoContatoEm: null }, user);
    expect(saved).toMatchObject({ etiquetas: ['quente'], nota: 'ligar', proximoContatoEm: null });
    expect(prisma.crmAfiliadoPerfil.upsert).toHaveBeenCalledTimes(1);
  });
});
