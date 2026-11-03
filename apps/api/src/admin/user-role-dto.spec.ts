import 'reflect-metadata';
import { validate } from 'class-validator';
import { UpdateUserRoleDto } from './admin.dto';

describe('UpdateUserRoleDto', () => {
  it.each(['cotista', 'afiliado', 'operacao', 'admin'])('aceita o perfil %s', async (papel) => {
    expect(await validate(Object.assign(new UpdateUserRoleDto(), { papel }))).toHaveLength(0);
  });
  it.each(['root', '', 'ADMIN'])('recusa o perfil %j', async (papel) => {
    expect(await validate(Object.assign(new UpdateUserRoleDto(), { papel }))).not.toHaveLength(0);
  });
});

import { ConflictException } from '@nestjs/common';
import { AdminService } from './admin.service';

describe('AdminService.updateUserRole', () => {
  function setup(opts: { target?: { papel: string } | null; affiliate?: { id: string; statusAprovacao: string } | null }) {
    const tx: any = {
      $queryRaw: jest.fn().mockResolvedValue([{ x: 1 }]),
      usuario: {
        findUnique: jest.fn().mockResolvedValue({ papel: 'admin', desativadoEm: null }),
        update: jest.fn().mockImplementation(async ({ data }: any) => ({ id: 'u2', papel: data.papel })),
      },
      afiliado: { findUnique: jest.fn().mockResolvedValue(opts.affiliate ?? null), create: jest.fn().mockResolvedValue({ id: 'a9', usuarioId: 'u2' }), update: jest.fn().mockResolvedValue({}) },
      grupo: { findFirst: jest.fn().mockResolvedValue(null), create: jest.fn().mockResolvedValue({ id: 'g1' }) }, grupoMembro: { upsert: jest.fn().mockResolvedValue({}) },
    };
    const prisma: any = {
      usuario: { findUnique: jest.fn().mockResolvedValue(opts.target === null ? null : { id: 'u2', nome: 'Maria', email: 'm@x.com', papel: opts.target?.papel ?? 'cotista' }) },
      $transaction: jest.fn().mockImplementation(async (fn: any) => fn(tx)),
    };
    return { service: new AdminService(prisma, { record: jest.fn() } as any), tx };
  }
  const admin = { id: 'u1', email: 'a@x.com', papel: 'admin' } as any;

  it.each(['afiliado', 'operacao', 'admin', 'cotista'] as const)('troca cotista para %s e encerra as sessões', async (papel) => {
    const { service, tx } = setup({ target: { papel: papel === 'cotista' ? 'admin' : 'cotista' } });
    await expect(service.updateUserRole('u2', { papel }, admin)).resolves.toEqual({ id: 'u2', papel });
    expect(tx.usuario.update.mock.calls[0][0].data).toEqual({ papel, tokenVersion: { increment: 1 } });
  });
  it('cria o cadastro de afiliado quando vira afiliado', async () => {
    const { service, tx } = setup({});
    await service.updateUserRole('u2', { papel: 'afiliado' }, admin);
    expect(tx.afiliado.create).toHaveBeenCalledTimes(1);
    expect(tx.grupo.create).toHaveBeenCalledTimes(1);
  });
  it('reativa o afiliado que estava inativo', async () => {
    const { service, tx } = setup({ affiliate: { id: 'a1', statusAprovacao: 'inativo' } });
    await service.updateUserRole('u2', { papel: 'afiliado' }, admin);
    expect(tx.afiliado.update.mock.calls[0][0].data.statusAprovacao).toBe('aprovado');
    expect(tx.afiliado.create).not.toHaveBeenCalled();
  });
  it('inativa o afiliado quando deixa de ser afiliado', async () => {
    const { service, tx } = setup({ target: { papel: 'afiliado' }, affiliate: { id: 'a1', statusAprovacao: 'aprovado' } });
    await service.updateUserRole('u2', { papel: 'operacao' }, admin);
    expect(tx.afiliado.update.mock.calls[0][0].data.statusAprovacao).toBe('inativo');
  });
  it('o administrador não tira o próprio acesso', async () => {
    const { service } = setup({});
    await expect(service.updateUserRole('u1', { papel: 'cotista' }, admin)).rejects.toBeInstanceOf(ConflictException);
  });
});
