import { PrismaClient } from '@prisma/client';
import * as argon2 from 'argon2';
import { isValidNewPassword } from './password-policy';
/** Explicit server-console recovery; never called by startup or HTTP routes. */
export async function recoverAdmin(prisma: PrismaClient, email: string, password: string) {
  email = email.trim().toLowerCase();
  if (!email.includes('@') || !isValidNewPassword(password)) throw new Error('Informe e-mail e senha numérica de 6 a 8 caracteres.');
  const hash = await argon2.hash(password, { type: argon2.argon2id });
  return prisma.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(28471, 1)`;
    const user = await tx.usuario.findUnique({ where: { email }, select: { id: true, papel: true, desativadoEm: true } });
    if (!user || user.papel !== 'admin') throw new Error('Administrador não encontrado neste banco. Confira o e-mail e o DATABASE_URL do serviço da API.');
    if (user.desativadoEm) throw new Error('Conta desativada: reative por outro administrador antes de recuperar a senha.');
    await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${user.id}::uuid FOR UPDATE`;
    await tx.usuario.update({ where: { id: user.id }, data: { senhaHash: hash, tentativasLogin: 0, bloqueadoAte: null, tokenVersion: { increment: 1 } } });
    await tx.tokenSenha.updateMany({ where: { usuarioId: user.id, usadoEm: null }, data: { usadoEm: new Date() } });
    await tx.auditoriaEvento.create({ data: { entidade: 'usuario', entidadeId: user.id, evento: 'auth.admin_recuperado_console', payloadDepois: { sessoesRevogadas: true, segundoFatorPreservado: true } } });
    return { ok: true };
  });
}
