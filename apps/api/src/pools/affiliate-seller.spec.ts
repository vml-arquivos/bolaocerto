import { ConflictException, ForbiddenException } from '@nestjs/common';
import { legalDocument, LEGAL_VERSION } from '../legal/documents';
import { AdminService } from '../admin/admin.service';
import { SharesService } from '../shares/shares.service';
import { PoolsService } from './pools.service';

const savedEnv = { ...process.env };
beforeAll(() => {
  process.env.PAYMENTS_ENABLED = 'true';
  Object.assign(process.env, { LEGAL_APPROVED_VERSION: LEGAL_VERSION, LEGAL_OPERATOR_NAME: 'Fixture', LEGAL_OPERATOR_CNPJ: '00000000000100', LEGAL_OPERATOR_ADDRESS: 'Fixture', LEGAL_CONTACT_EMAIL: 'test@example.invalid', LEGAL_REFUND_TERMS: 'Fixture', LEGAL_AFFILIATE_PAYOUT_TERMS: 'Fixture' });
});
afterAll(() => { process.env = savedEnv; });

const affiliateUser = { id: 'u-aff', papel: 'afiliado' } as any;
const admin = { id: 'admin-1', papel: 'admin' } as any;

function poolsFor(members: number, extra = 0) {
  const created: any[] = [];
  const tx: any = {
    bolao: { create: jest.fn(async ({ data }: any) => { created.push(data); return { id: 'pool-1', ...data }; }), findUnique: jest.fn() },
    jogoBolao: { createMany: jest.fn() },
    grupo: { update: jest.fn() },
  };
  const prisma: any = {
    afiliado: { findUnique: jest.fn(async () => ({ id: 'aff-1', statusAprovacao: 'aprovado', comissaoPadraoPct: { toFixed: () => '10.00' } })) },
    aceiteLegal: { findUnique: jest.fn(async () => ({ id: 'ok' })) },
    concurso: { findUnique: jest.fn(async () => ({ id: 'c1', cutoffAt: new Date(Date.now() + 86_400_000), modalidade: 'megasena', config: { taxaAdministracaoTetoPct: 35, minCotasBolao: 2, maxCotasBolao: 500 } })) },
    grupo: { findFirst: jest.fn(async () => ({ id: 'g1', afiliadoId: 'aff-1' })), findUnique: jest.fn(async () => ({ capacidadeExtra: extra })) },
    grupoMembro: { count: jest.fn(async () => members) },
    $transaction: async (cb: any) => cb(tx),
  };
  const service = new PoolsService(prisma, { record: jest.fn() } as any);
  // pega o bolão recém-criado sem passar por getPublicById
  (service as any).getPublicById = jest.fn(async (id: string) => ({ id }));
  return { service, created, prisma };
}
const dto = (totalCotas: number) => ({ concursoId: 'c1', grupoId: 'g1', numerosApostados: [1, 2, 3, 4, 5, 6], totalCotas, valorCota: 10, taxaAdministracaoPct: 10, modeloOperacional: 'mandato' }) as any;

describe('afiliado vendedor: bolão limitado ao tamanho do grupo', () => {
  it('grupo com 50 pessoas: bolão de 50 cotas passa, de 51 não', async () => {
    const ok = poolsFor(50);
    await expect(ok.service.create(dto(50), affiliateUser)).resolves.toBeTruthy();
    expect(ok.created[0]).toMatchObject({ tipoOrganizador: 'afiliado', status: 'rascunho' });
    const blocked = poolsFor(50);
    await expect(blocked.service.create(dto(51), affiliateUser)).rejects.toThrow(/no máximo 50 cotas/);
    expect(blocked.created).toHaveLength(0);
  });

  it('grupo com 20 pessoas não abre bolão de 100 cotas', async () => {
    await expect(poolsFor(20).service.create(dto(100), affiliateUser)).rejects.toThrow(/20 pessoas.*no máximo 20 cotas/);
  });

  it('as pessoas autorizadas pelo admin entram na conta (membros + extra)', async () => {
    const { service } = poolsFor(30, 20);
    await expect(service.create(dto(50), affiliateUser)).resolves.toBeTruthy();
    await expect(service.create(dto(51), affiliateUser)).rejects.toThrow(/no máximo 50 cotas/);
  });

  it('grupo pequeno demais para o mínimo da modalidade pede mais gente', async () => {
    await expect(poolsFor(1).service.create(dto(2), affiliateUser)).rejects.toThrow(/pelo menos 2/);
  });

  it('o admin não tem esse limite (só os limites da modalidade)', async () => {
    const { service, prisma } = poolsFor(0);
    prisma.grupo.findFirst = jest.fn(async () => ({ id: 'g1', afiliadoId: 'aff-1' }));
    await expect(service.create(dto(100), admin)).resolves.toBeTruthy();
    expect(prisma.grupoMembro.count).not.toHaveBeenCalled();
  });
});

describe('afiliado vendedor: aprovação do admin', () => {
  function publishFixture(user: any, organizer: 'afiliado' | 'admin') {
    const updates: any[] = [];
    const base = { id: 'pool-1', criadoPor: 'u-aff', status: 'rascunho', tipoOrganizador: organizer, comprovanteAntesVenda: false, concurso: { cutoffAt: new Date(Date.now() + 86_400_000), status: 'aberto', resultado: null } };
    const tx: any = {
      $queryRaw: jest.fn(),
      bolao: { findUniqueOrThrow: jest.fn(async () => base), update: jest.fn(async ({ data }: any) => { updates.push(data); return { id: 'pool-1', status: data.status ?? 'rascunho', ...data }; }) },
      usuario: { findMany: jest.fn(async () => [{ id: 'admin-1' }]) },
      notificacao: { create: jest.fn(async () => ({})), createMany: jest.fn(async () => ({ count: 1 })) },
    };
    const prisma: any = {
      bolao: { findUnique: jest.fn(async () => base) },
      afiliado: { findUnique: jest.fn(async () => ({ statusAprovacao: 'aprovado', comissaoPadraoPct: { toFixed: () => '10.00' } })) },
      aceiteLegal: { findUnique: jest.fn(async () => ({ id: 'ok' })) },
      $transaction: async (cb: any) => cb(tx),
    };
    return { service: new PoolsService(prisma, { record: jest.fn() } as any), updates, user };
  }

  it('afiliado só PEDE aprovação: o bolão continua rascunho', async () => {
    const { service, updates } = publishFixture(affiliateUser, 'afiliado');
    await expect(service.publish('pool-1', affiliateUser)).resolves.toMatchObject({ aguardandoAprovacao: true, status: 'rascunho' });
    expect(updates[0]).toHaveProperty('aprovacaoSolicitadaEm');
    expect(updates[0]).not.toHaveProperty('status');
  });

  it('admin aprova e abre a venda, registrando quem aprovou', async () => {
    const { service, updates } = publishFixture(admin, 'afiliado');
    await expect(service.publish('pool-1', admin)).resolves.toMatchObject({ status: 'aberto' });
    expect(updates[0]).toMatchObject({ status: 'aberto', aprovadoPor: 'admin-1' });
    expect(updates[0].aprovadoEm).toBeInstanceOf(Date);
  });

  it('bolão do próprio admin publica sem marcar aprovação', async () => {
    const { service, updates } = publishFixture(admin, 'admin');
    await service.publish('pool-1', admin);
    expect(updates[0]).toMatchObject({ status: 'aberto' });
    expect(updates[0]).not.toHaveProperty('aprovadoPor');
  });

  it('recusar devolve ao afiliado com o motivo e avisa por notificação', async () => {
    const notificacao = { create: jest.fn() };
    const bolao = { update: jest.fn() };
    const prisma: any = {
      bolao: { findUnique: jest.fn(async () => ({ id: 'pool-1', status: 'rascunho', aprovacaoSolicitadaEm: new Date(), criadoPor: 'u-aff', grupo: { nome: 'Grupo do João' } })) },
      $transaction: async (cb: any) => cb({ bolao, notificacao }),
    };
    const service = new PoolsService(prisma, { record: jest.fn() } as any);
    await service.rejectApproval('pool-1', 'Valor da cota muito baixo', admin);
    expect(bolao.update).toHaveBeenCalledWith({ where: { id: 'pool-1' }, data: { aprovacaoSolicitadaEm: null } });
    expect(notificacao.create.mock.calls[0][0].data.payload.mensagem).toMatch(/Valor da cota muito baixo/);
    prisma.bolao.findUnique = jest.fn(async () => ({ id: 'pool-1', status: 'aberto', aprovacaoSolicitadaEm: null, grupo: null }));
    await expect(service.rejectApproval('pool-1', 'x', admin)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('afiliado vendedor: convites e grupo', () => {
  it('afiliado não convida outros afiliados; admin pode', async () => {
    const prisma: any = {
      afiliado: { findUnique: jest.fn(async () => ({ id: 'aff-1', statusAprovacao: 'aprovado' })), findFirst: jest.fn() },
      grupo: { findUnique: jest.fn() },
      convite: { create: jest.fn(async ({ data }: any) => ({ id: 'i1', ...data, status: 'ativo' })) },
      $transaction: async (cb: any) => cb(prisma),
    };
    const service = new AdminService(prisma, { record: jest.fn() } as any);
    await expect(service.createInvite({ tipo: 'afiliado' } as any, affiliateUser)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createInvite({ tipo: 'afiliado' } as any, admin)).resolves.toBeTruthy();
  });

  it('convite de grupo só vale para grupo do próprio afiliado e só para cliente', async () => {
    const prisma: any = {
      afiliado: { findUnique: jest.fn(async () => ({ id: 'aff-1', statusAprovacao: 'aprovado' })) },
      grupo: { findUnique: jest.fn(async ({ where }: any) => (where.id === 'g-meu' ? { id: 'g-meu', afiliadoId: 'aff-1' } : where.id === 'g-outro' ? { id: 'g-outro', afiliadoId: 'aff-2' } : null)) },
      convite: { create: jest.fn(async ({ data }: any) => ({ id: 'i1', ...data, status: 'ativo' })) },
      $transaction: async (cb: any) => cb(prisma),
    };
    const service = new AdminService(prisma, { record: jest.fn() } as any);
    const invite = await service.createInvite({ tipo: 'usuario', grupoId: 'g-meu' } as any, affiliateUser);
    expect(invite.grupoId).toBe('g-meu');
    expect(prisma.convite.create.mock.calls[0][0].data.afiliadoOrigemId).toBe('aff-1');
    await expect(service.createInvite({ tipo: 'usuario', grupoId: 'g-outro' } as any, affiliateUser)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.createInvite({ tipo: 'usuario', grupoId: 'nao-existe' } as any, affiliateUser)).rejects.toThrow(/não encontrado/);
  });

  it('afiliado só vê os membros do próprio grupo; e-mail vem mascarado', async () => {
    const prisma: any = {
      afiliado: { findUnique: jest.fn(async () => ({ id: 'aff-1', statusAprovacao: 'aprovado' })) },
      grupo: { findUnique: jest.fn(async ({ where }: any) => ({ id: where.id, nome: 'G', afiliadoId: where.id === 'g1' ? 'aff-1' : 'aff-2', capacidadeExtra: 5 })) },
      grupoMembro: { findMany: jest.fn(async () => [{ id: 'm1', criadoEm: new Date(), usuario: { nome: 'Maria', email: 'maria@x.com' } }]) },
    };
    const service = new AdminService(prisma, { record: jest.fn() } as any);
    const out = await service.listGroupMembers('g1', affiliateUser);
    expect(out).toMatchObject({ totalMembros: 1, capacidade: 6 });
    expect(out.membros[0]!.email).toBe('ma***@x.com');
    await expect(service.listGroupMembers('g2', affiliateUser)).rejects.toBeInstanceOf(ForbiddenException);
  });
});

describe('afiliado vendedor: comissão na compra', () => {
  function reserve(groupAffiliate: any, buyerId: string, code?: any) {
    const pool = { id: 'pool-1', status: 'aberto', valorCota: '6.00', taxaAdministracaoPct: '10.00', cotasVendidas: 0, totalCotas: 10, grupo: { afiliado: groupAffiliate } };
    const created: any[] = [];
    const tx: any = {
      $queryRaw: jest.fn(),
      concurso: { findUniqueOrThrow: jest.fn(async () => ({ cutoffAt: new Date(Date.now() + 86_400_000) })) },
      bolao: { findUnique: jest.fn(async () => pool), update: jest.fn(async () => pool) },
      grupo: { findFirst: jest.fn().mockResolvedValue(null) }, grupoMembro: { upsert: jest.fn().mockResolvedValue({}) },
      cota: { create: jest.fn(async ({ data }: any) => { created.push(data); return { id: 's1', bolaoId: 'pool-1', status: 'reservada', quantidade: 1, expiraReservaEm: new Date() }; }) },
    };
    const prisma: any = { afiliado: { findFirst: jest.fn(async () => code ?? null) }, $transaction: async (cb: any) => cb(tx) };
    const service = new SharesService(prisma, { record: jest.fn() } as any);
    const body = { bolaoId: 'pool-1', titularCpf: '52998224725', titularNome: 'Pessoa', quantidade: 1, termoMandatoHash: legalDocument('participacao').hash, aceitoTermos: true, ...(code ? { codigoAfiliado: 'BL-X' } : {}) };
    return service.reserve(body as any, { id: buyerId, papel: 'cotista' } as any, { ip: '1.1.1.1' }).then(() => created[0]);
  }

  it('compra num bolão do grupo do afiliado comissiona o dono do grupo', async () => {
    expect((await reserve({ id: 'aff-1', usuarioId: 'u-aff', statusAprovacao: 'aprovado' }, 'cliente-1')).afiliadoReferenciaId).toBe('aff-1');
  });

  it('o dono do grupo vence o código de outro afiliado', async () => {
    expect((await reserve({ id: 'aff-1', usuarioId: 'u-aff', statusAprovacao: 'aprovado' }, 'cliente-1', { id: 'aff-9', usuarioId: 'u-9' })).afiliadoReferenciaId).toBe('aff-1');
  });

  it('afiliado comprando o próprio bolão não ganha comissão', async () => {
    expect((await reserve({ id: 'aff-1', usuarioId: 'u-aff', statusAprovacao: 'aprovado' }, 'u-aff')).afiliadoReferenciaId).toBeUndefined();
  });

  it('afiliado sem aprovação não comissiona; sem afiliado segue o código de indicação', async () => {
    expect((await reserve({ id: 'aff-1', usuarioId: 'u-aff', statusAprovacao: 'pendente' }, 'cliente-1')).afiliadoReferenciaId).toBeUndefined();
    expect((await reserve(null, 'cliente-1', { id: 'aff-9', usuarioId: 'u-9' })).afiliadoReferenciaId).toBe('aff-9');
  });
});

describe('convite por e-mail', () => {
  function build(mail: any) {
    const prisma: any = {
      afiliado: { findUnique: jest.fn(async () => ({ id: 'aff-1', statusAprovacao: 'aprovado' })) },
      convite: { create: jest.fn(async ({ data }: any) => ({ id: 'i1', ...data, status: 'ativo' })) },
      $transaction: async (cb: any) => cb(prisma),
    };
    return new AdminService(prisma, { record: jest.fn() } as any, mail);
  }
  it('envia o link por e-mail quando há endereço e SMTP', async () => {
    const mail: any = { isConfigured: () => true, publicUrl: () => 'https://bl.exemplo', send: jest.fn(async () => true) };
    const out = await build(mail).createInvite({ tipo: 'usuario', emailDestino: 'Maria@Exemplo.com' } as any, affiliateUser);
    expect(out.emailEnviado).toBe(true);
    expect(mail.send.mock.calls[0][0].to).toBe('maria@exemplo.com');
    expect(mail.send.mock.calls[0][0].text).toContain('https://bl.exemplo/r/');
  });
  it('sem SMTP o convite é criado e o link continua disponível', async () => {
    const mail: any = { isConfigured: () => false, publicUrl: () => 'x', send: jest.fn() };
    const out = await build(mail).createInvite({ tipo: 'usuario', emailDestino: 'maria@exemplo.com' } as any, affiliateUser);
    expect(out.emailEnviado).toBe(false);
    expect(out.caminho).toMatch(/^\/r\//);
    expect(mail.send).not.toHaveBeenCalled();
  });
});
