import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { AdminService } from './admin.service';
import { isSuperAdmin } from './superadmin';

describe('isSuperAdmin', () => {
  it('só o administrador com o e-mail de instalação (sem diferenciar maiúsculas)', () => {
    const env = { ADMIN_BOOTSTRAP_EMAIL: 'Dono@Exemplo.com' } as NodeJS.ProcessEnv;
    expect(isSuperAdmin({ email: ' dono@exemplo.com ', papel: 'admin' }, env)).toBe(true);
    expect(isSuperAdmin({ email: 'dono@exemplo.com', papel: 'operacao' }, env)).toBe(false);
    expect(isSuperAdmin({ email: 'outro@exemplo.com', papel: 'admin' }, env)).toBe(false);
    expect(isSuperAdmin({ email: 'dono@exemplo.com', papel: 'admin' }, {} as NodeJS.ProcessEnv)).toBe(false);
  });
});

describe('AdminService.deleteGroup', () => {
  const OLD = process.env.ADMIN_BOOTSTRAP_EMAIL;
  beforeEach(() => { process.env.ADMIN_BOOTSTRAP_EMAIL = 'dono@example.invalid'; });
  afterEach(() => { if (OLD === undefined) delete process.env.ADMIN_BOOTSTRAP_EMAIL; else process.env.ADMIN_BOOTSTRAP_EMAIL = OLD; });
  const superActor = { id: 'a1', papel: 'admin' as const, email: 'dono@example.invalid' };
  const other = { id: 'a2', papel: 'admin' as const, email: 'outro@example.invalid' };
  function setup(group: any) {
    const tx: any = {
      $executeRaw: jest.fn().mockResolvedValue(1),
      usuario: { findUnique: jest.fn().mockResolvedValue({ papel: 'admin', desativadoEm: null }) },
      grupo: { findUnique: jest.fn().mockResolvedValue(group), delete: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = { $transaction: (fn: any) => fn(tx) };
    const audit: any = { record: jest.fn().mockResolvedValue(undefined) };
    return { service: new AdminService(prisma, audit), tx, audit };
  }
  it('admin comum não pode excluir grupo', async () => {
    const { service, tx } = setup({ id: 'g', tipo: 'afiliado', _count: { boloes: 0, membros: 0 } });
    await expect(service.deleteGroup('g', other)).rejects.toBeInstanceOf(ForbiddenException);
    expect(tx.grupo.delete).not.toHaveBeenCalled();
  });
  it('superadmin exclui grupo sem bolões; as pessoas só saem do grupo; fica no histórico', async () => {
    const { service, tx, audit } = setup({ id: 'g', nome: 'Grupo X', slug: 'x', tipo: 'afiliado', _count: { boloes: 0, membros: 4 } });
    await expect(service.deleteGroup('g', superActor)).resolves.toEqual({ id: 'g', excluido: true, pessoasDesvinculadas: 4 });
    expect(tx.grupo.delete).toHaveBeenCalledWith({ where: { id: 'g' } });
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ evento: 'grupo.excluido', atorId: 'a1' }));
  });
  it('não exclui grupo oficial nem grupo com bolões, e avisa quando não existe', async () => {
    const official = setup({ id: 'g', tipo: 'oficial', _count: { boloes: 0, membros: 0 } });
    await expect(official.service.deleteGroup('g', superActor)).rejects.toThrow(/oficial/);
    const withPools = setup({ id: 'g', tipo: 'afiliado', _count: { boloes: 2, membros: 1 } });
    await expect(withPools.service.deleteGroup('g', superActor)).rejects.toThrow(/2 bolões/);
    expect(withPools.tx.grupo.delete).not.toHaveBeenCalled();
    const missing = setup(null);
    await expect(missing.service.deleteGroup('g', superActor)).rejects.toBeInstanceOf(NotFoundException);
    await expect(official.service.deleteGroup('g', superActor)).rejects.toBeInstanceOf(ConflictException);
  });
});
