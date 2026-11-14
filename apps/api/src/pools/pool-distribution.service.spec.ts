import { BadRequestException, ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { DISTRIBUTION_TERM, PoolDistributionService, distributionPath, distributionTermHash, newDistributionCode } from './pool-distribution.service';

const user = { id: 'u1', papel: 'afiliado' } as any;
const affiliate = { id: 'a1', codigoAfiliado: 'AFIL1', statusAprovacao: 'aprovado', usuario: { nome: 'Afiliado Um' } };

function build(over: { affiliate?: any; link?: any; existing?: any } = {}) {
  const calls = { create: [] as any[], update: [] as any[], notify: [] as any[], audit: [] as any[], consent: [] as any[] };
  const link = over.link === undefined ? { id: 'l1', bolaoId: 'b1', criadoPor: 'staff1', afiliadoAlvoId: null, revogadoEm: null, bolao: { id: 'b1', status: 'aberto' } } : over.link;
  const tx = { aceiteLegal: { upsert: async (arg: any) => { calls.consent.push(arg); } }, bolaoAfiliado: { create: async (arg: any) => { calls.create.push(arg); }, update: async (arg: any) => { calls.update.push(arg); } } };
  const prisma: any = {
    afiliado: { findUnique: async () => (over.affiliate === undefined ? affiliate : over.affiliate) },
    distribuicaoBolao: { findUnique: async () => link },
    bolaoAfiliado: { findUnique: async () => over.existing ?? null },
    $transaction: async (fn: any) => fn(tx),
  };
  const audit: any = { record: async (_tx: any, entry: any) => { calls.audit.push(entry); } };
  const notifications: any = { notify: async (...args: any[]) => { calls.notify.push(args); } };
  return { service: new PoolDistributionService(prisma, audit, notifications), calls };
}

describe('PoolDistributionService', () => {
  it('gera códigos longos e diferentes e o caminho público', () => {
    const codes = new Set(Array.from({ length: 50 }, newDistributionCode));
    expect(codes.size).toBe(50);
    expect([...codes][0]!.length).toBeGreaterThanOrEqual(12);
    expect(distributionPath('abc')).toBe('/bolao-afiliado/abc');
  });

  it('afiliado aprovado aceita: entra no painel, equipe é avisada e o link de venda usa o código dele', async () => {
    const { service, calls } = build();
    const result = await service.accept('xyz', user, { aceiteTermo: true, ip: '1.2.3.4', userAgent: 'teste' });
    expect(calls.consent[0].create).toMatchObject({ usuarioId: 'u1', tipo: 'venda_bolao', hash: distributionTermHash('b1'), versao: DISTRIBUTION_TERM.versao, ip: '1.2.3.4', userAgent: 'teste' });
    expect(result).toMatchObject({ ok: true, jaTinha: false, bolaoId: 'b1', linkVenda: '/r/AFIL1?bolao=b1' });
    expect(calls.create[0].data).toMatchObject({ bolaoId: 'b1', afiliadoId: 'a1', distribuicaoId: 'l1', enviadoPor: 'staff1' });
    expect(calls.notify[0][0]).toBe('staff1');
    expect(calls.audit[0].evento).toBe('bolao.distribuicao_aceita');
  });

  it('aceitar duas vezes não duplica nem avisa de novo', async () => {
    const { service, calls } = build({ existing: { id: 'r1', removidoEm: null } });
    const result = await service.accept('xyz', user);
    expect(result.jaTinha).toBe(true);
    expect(calls.create).toHaveLength(0); expect(calls.notify).toHaveLength(0);
  });

  it('afiliado que foi retirado volta a receber quando abre o link de novo', async () => {
    const { service, calls } = build({ existing: { id: 'r1', removidoEm: new Date() } });
    const result = await service.accept('xyz', user, { aceiteTermo: true });
    expect(result.jaTinha).toBe(false);
    expect(calls.update[0].data).toMatchObject({ removidoEm: null, removidoPor: null });
  });

  it('sem aceitar o termo, o bolão não entra no painel', async () => {
    const { service, calls } = build();
    await expect(service.accept('xyz', user)).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.accept('xyz', user, { aceiteTermo: false })).rejects.toThrow(/aceite o termo/);
    expect(calls.create).toHaveLength(0); expect(calls.consent).toHaveLength(0);
    expect(distributionTermHash('b1')).not.toBe(distributionTermHash('b2'));
  });

  it('quem não é afiliado aprovado não recebe para vender', async () => {
    await expect(build({ affiliate: null }).service.accept('xyz', user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(build({ affiliate: { ...affiliate, statusAprovacao: 'pendente' } }).service.accept('xyz', user)).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('link cancelado, inexistente, de outro afiliado ou de bolão fechado é recusado', async () => {
    await expect(build({ link: null }).service.accept('x', user)).rejects.toBeInstanceOf(NotFoundException);
    await expect(build({ link: { id: 'l1', bolaoId: 'b1', criadoPor: 's', afiliadoAlvoId: null, revogadoEm: new Date(), bolao: { id: 'b1', status: 'aberto' } } }).service.accept('x', user)).rejects.toBeInstanceOf(NotFoundException);
    await expect(build({ link: { id: 'l1', bolaoId: 'b1', criadoPor: 's', afiliadoAlvoId: 'outro', revogadoEm: null, bolao: { id: 'b1', status: 'aberto' } } }).service.accept('x', user)).rejects.toBeInstanceOf(ForbiddenException);
    await expect(build({ link: { id: 'l1', bolaoId: 'b1', criadoPor: 's', afiliadoAlvoId: null, revogadoEm: null, bolao: { id: 'b1', status: 'fechado' } } }).service.accept('x', user)).rejects.toBeInstanceOf(ConflictException);
  });
});

describe('Bolões aguardando o aceite do afiliado', () => {
  const affiliateRow = { id: 'a1', codigoAfiliado: 'AFIL1', statusAprovacao: 'aprovado', usuario: { nome: 'Afiliado Um' } };
  const pool = (id: string) => ({ id, status: 'aberto', valorCota: { toFixed: () => '10.00' }, cotasIlimitadas: false, totalCotas: 10, cotasVendidas: 2, vendaFimEm: null, concurso: { modalidade: 'megasena', numeroConcurso: 3000, nomeEspecial: null, cutoffAt: new Date('2026-12-31') } });
  const link = (codigo: string, bolaoId: string, criadoEm: string) => ({ codigo, bolaoId, criadoEm: new Date(criadoEm), criador: { nome: 'Equipe BL' }, bolao: pool(bolaoId) });
  it('mostra só os enviados para ele que ainda não aceitou; retirado volta só com link novo', async () => {
    const prisma: any = {
      afiliado: { findUnique: async () => affiliateRow },
      bolaoAfiliado: { findMany: jest.fn().mockResolvedValueOnce([]).mockResolvedValueOnce([{ bolaoId: 'b2', removidoEm: null }, { bolaoId: 'b3', removidoEm: new Date('2026-11-10') }, { bolaoId: 'b4', removidoEm: new Date('2026-11-10') }]) },
      cota: { groupBy: async () => [] },
      distribuicaoBolao: { findMany: jest.fn().mockResolvedValue([link('c1', 'b1', '2026-11-12'), link('c1b', 'b1', '2026-11-11'), link('c2', 'b2', '2026-11-12'), link('c3', 'b3', '2026-11-09'), link('c4', 'b4', '2026-11-12')]) },
    };
    const service = new PoolDistributionService(prisma, { record: async () => undefined } as any);
    const result = await service.received({ id: 'u1', papel: 'afiliado' } as any);
    expect(result.pendentes.map((item: any) => item.codigo)).toEqual(['c1', 'c4']);
    expect(result.termo.versao).toBe(DISTRIBUTION_TERM.versao);
    expect(prisma.distribuicaoBolao.findMany.mock.calls[0][0].where).toMatchObject({ afiliadoAlvoId: 'a1', revogadoEm: null });
  });
});
