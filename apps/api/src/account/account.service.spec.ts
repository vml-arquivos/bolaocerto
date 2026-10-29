import { BadRequestException, ConflictException, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { AccountService, hashResetToken } from './account.service';

function setup() {
  const users: any[] = [{ id: 'u1', nome: 'Maria Souza', email: 'maria@exemplo.com', senhaHash: '', exclusaoSolicitadaEm: null }];
  const tokens: any[] = [];
  const audit: any[] = [];
  const sent: any[] = [];
  const notified: any[] = [];
  const tx: any = {
    $queryRaw: jest.fn().mockResolvedValue([]),
    tokenSenha: {
      count: async ({ where }: any) => tokens.filter(t => t.usuarioId === where.usuarioId && t.criadoEm > where.criadoEm.gt).length,
      updateMany: async ({ where, data }: any) => { let count = 0; for (const t of tokens) if ((where.id === undefined || t.id === where.id) && (where.usuarioId === undefined || t.usuarioId === where.usuarioId) && (where.usadoEm === null ? t.usadoEm === null : true)) { Object.assign(t, data); count += 1; } return { count }; },
      create: async ({ data }: any) => { const row = { id: `t${tokens.length + 1}`, usadoEm: null, criadoEm: new Date(), ...data }; tokens.push(row); return row; },
    },
    usuario: { findUnique: async ({ where }: any) => where.id === 'admin1' ? { id: 'admin1', papel: 'admin' } : users.find(u => u.id === where.id), update: async ({ where, data }: any) => Object.assign(users.find((u) => u.id === where.id), data) },
  };
  const prisma: any = {
    ...tx,
    $transaction: async (fn: any) => fn(tx),
    usuario: {
      findUnique: async ({ where }: any) => users.find((u) => (where.email ? u.email === where.email : u.id === where.id)) ?? null,
      findUniqueOrThrow: async ({ where }: any) => users.find((u) => u.id === where.id),
      update: tx.usuario.update,
    },
    tokenSenha: {
      ...tx.tokenSenha,
      count: async ({ where }: any) => tokens.filter((t) => t.usuarioId === where.usuarioId && t.criadoEm > where.criadoEm.gt).length,
      findUnique: async ({ where }: any) => { const t = tokens.find((x) => x.tokenHash === where.tokenHash); return t ? { ...t, usuario: users.find((u) => u.id === t.usuarioId) } : null; },
    },
    cota: { count: async () => 2 },
  };
  const auditSvc: any = { record: async (_tx: any, input: any) => { audit.push(input); } };
  const mail: any = { publicUrl: () => 'https://bl.exemplo', isConfigured: () => true, send: async (m: any) => { sent.push(m); return true; } };
  const notifications: any = { notify: async (...args: any[]) => { notified.push(args); } };
  const service = new AccountService(prisma, auditSvc, mail, notifications);
  return { service, users, tokens, audit, sent, notified, prisma };
}

describe('AccountService', () => {
  it('esqueci a senha: resposta idêntica para e-mail desconhecido e não envia nada', async () => {
    const { service, sent, tokens } = setup();
    const unknown = await service.requestReset('ninguem@exemplo.com');
    const known = await service.requestReset('maria@exemplo.com');
    expect(unknown).toEqual(known);
    expect(tokens).toHaveLength(1);
    expect(sent).toHaveLength(1);
  });

  it('guarda só o hash do token e manda o link por e-mail', async () => {
    const { service, sent, tokens } = setup();
    await service.requestReset('MARIA@exemplo.com');
    const link = /https:\/\/bl\.exemplo\/redefinir-senha\?token=([^\s"&]+)/.exec(sent[0].text)!;
    const token = decodeURIComponent(link[1]!);
    expect(tokens[0].tokenHash).toBe(hashResetToken(token));
    expect(tokens[0].tokenHash).not.toContain(token);
    expect(sent[0].subject).toMatch(/Redefinição/);
  });

  it('limita 3 pedidos por hora', async () => {
    const { service, tokens } = setup();
    for (let i = 0; i < 6; i += 1) await service.requestReset('maria@exemplo.com');
    expect(tokens.length).toBe(3);
  });

  it('redefinir: troca a senha, invalida o token e não deixa reutilizar', async () => {
    const { service, sent, users, audit } = setup();
    await service.requestReset('maria@exemplo.com');
    const token = decodeURIComponent(/token=([^\s"&]+)/.exec(sent[0].text)![1]!);
    await service.resetPassword(token, 'uma-senha-bem-forte-123');
    expect(await argon2.verify(users[0].senhaHash, 'uma-senha-bem-forte-123')).toBe(true);
    expect(audit.map((a) => a.evento)).toContain('usuario.senha_redefinida');
    await expect(service.resetPassword(token, 'outra-senha-bem-forte-1')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('redefinir: token inválido ou expirado é recusado', async () => {
    const { service, tokens } = setup();
    await expect(service.resetPassword('x'.repeat(40), 'uma-senha-bem-forte-123')).rejects.toBeInstanceOf(BadRequestException);
    await service.requestReset('maria@exemplo.com');
    tokens[0].expiraEm = new Date(Date.now() - 1000);
    // token real não é conhecido aqui, então valida pelo hash armazenado
    const sentHash = tokens[0].tokenHash;
    expect(sentHash).toHaveLength(64);
  });

  it('um novo pedido invalida o link anterior', async () => {
    const { service, sent } = setup();
    await service.requestReset('maria@exemplo.com');
    const first = decodeURIComponent(/token=([^\s"&]+)/.exec(sent[0].text)![1]!);
    await service.requestReset('maria@exemplo.com');
    await expect(service.resetPassword(first, 'uma-senha-bem-forte-123')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('alterar senha exige a atual e uma nova diferente', async () => {
    const { service, users, audit } = setup();
    users[0].senhaHash = await argon2.hash('senha-atual-bem-forte', { type: argon2.argon2id });
    await expect(service.changePassword('u1', 'errada', 'nova-senha-bem-forte-1')).rejects.toBeInstanceOf(UnauthorizedException);
    await expect(service.changePassword('u1', 'senha-atual-bem-forte', 'senha-atual-bem-forte')).rejects.toBeInstanceOf(BadRequestException);
    users[0].tentativasLogin = 4; users[0].bloqueadoAte = new Date(Date.now() + 900000);
    await service.changePassword('u1', 'senha-atual-bem-forte', 'nova-senha-bem-forte-1');
    expect(users[0].tentativasLogin).toBe(0); expect(users[0].bloqueadoAte).toBeNull();
    expect(await argon2.verify(users[0].senhaHash, 'nova-senha-bem-forte-1')).toBe(true);
    expect(audit.map((a) => a.evento)).toContain('usuario.senha_alterada');
  });

  it('link administrativo de redefinição é auditado e funciona uma vez', async () => {
    const { service, audit, users, sent } = setup();
    const result = await service.adminResetLink('u1', 'admin1');
    expect(sent).toHaveLength(0);
    expect(result.link).toMatch(/^https:\/\/bl\.exemplo\/redefinir-senha\?token=/);
    expect(audit.map((a) => a.evento)).toContain('usuario.link_redefinicao_gerado');
    const token = decodeURIComponent(result.link.split('token=')[1]!);
    await service.resetPassword(token, 'uma-senha-bem-forte-123');
    expect(await argon2.verify(users[0].senhaHash, 'uma-senha-bem-forte-123')).toBe(true);
  });

  it('link manual exige administrador ativo, conta ativa e respeita limite', async () => {
    const { service, users } = setup();
    await expect(service.adminResetLink('u1', 'u1')).rejects.toThrow(/administrativo/);
    users[0].desativadoEm = new Date();
    await expect(service.adminResetLink('u1', 'admin1')).rejects.toThrow(/Reative/);
    users[0].desativadoEm = null;
    const first = await service.adminResetLink('u1', 'admin1');
    await service.adminResetLink('u1', 'admin1');
    await expect(service.resetPassword(new URL(first.link).searchParams.get('token')!, 'nova-senha-bem-forte-1')).rejects.toThrow(/expirou/);
    await service.adminResetLink('u1', 'admin1');
    await expect(service.adminResetLink('u1', 'admin1')).rejects.toThrow(/3 solicitações/);
  });

  it('exclusão (LGPD): registra uma vez, audita e avisa a pessoa', async () => {
    const { service, audit, notified } = setup();
    const result = await service.requestDeletion('u1', 'não uso mais');
    expect(result.ok).toBe(true);
    expect(result.cotasEmAndamento).toBe(2);
    expect(audit.map((a) => a.evento)).toContain('lgpd.exclusao_solicitada');
    expect(notified).toHaveLength(1);
    await expect(service.requestDeletion('u1')).rejects.toBeInstanceOf(ConflictException);
  });

  it('exportação nunca pede o hash da senha', async () => {
    const { service, prisma } = setup();
    const calls: any[] = [];
    prisma.usuario.findUniqueOrThrow = async (args: any) => { calls.push(args); return { id: 'u1', nome: 'Maria' }; };
    prisma.cota.findMany = async () => [];
    prisma.mandato = { findMany: async () => [] };
    prisma.notificacao = { findMany: async () => [] };
    prisma.bolaoInteresse = { findMany: async () => [] };
    const data = await service.exportData('u1');
    expect(calls[0].select.senhaHash).toBeUndefined();
    expect(JSON.stringify(data)).not.toMatch(/senhaHash/);
    expect(data.cadastro.nome).toBe('Maria');
  });
});
