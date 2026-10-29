import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash, randomBytes } from 'node:crypto';
import { AuthUser, assertAdult } from '../auth/auth.utils';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { MailService } from '../common/mail.service';
import { IsDateString, IsEmail, IsString, Length, MaxLength, ValidateIf } from 'class-validator';

export class EditManagedUserDto {
  @IsString() @Length(2, 150) nome!: string;
  @IsEmail() @MaxLength(180) email!: string;
  @ValidateIf((_o, v) => v !== undefined) @IsString() @MaxLength(20) telefone?: string;
  @ValidateIf((_o, v) => v !== undefined) @IsDateString({ strict: true }) dataNascimento?: string;
}
/** Serializes account administration, including mutually revoking administrators. */
export async function lockAdminActor(tx: Prisma.TransactionClient, actorId: string) {
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(28471, 1)`;
  const actor = await tx.usuario.findUnique({ where: { id: actorId }, select: { papel: true, desativadoEm: true } });
  if (!actor || actor.papel !== 'admin' || actor.desativadoEm) throw new ForbiddenException('Acesso administrativo indisponível.');
}
const view = { id: true, nome: true, email: true, cpf: true, telefone: true, dataNascimento: true, papel: true, statusKyc: true, desativadoEm: true, criadoEm: true, atualizadoEm: true } as const;
const mask = (cpf: string) => `${cpf.slice(0,3)}.***.***-${cpf.slice(-2)}`;
@Injectable()
export class AdminUsersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly mail: MailService) {}
  async detail(id: string, actor: AuthUser) {
    if (actor.papel !== 'admin') throw new ForbiddenException();
    const user = await this.prisma.usuario.findUnique({ where: { id }, select: { ...view, _count: { select: { cotasCompradas: true, boloesCriados: true } } } });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return { ...user, cpf: mask(user.cpf) };
  }
  async edit(id: string, dto: EditManagedUserDto, actor: AuthUser) {
    const nome = dto.nome.trim(); const email = dto.email.trim().toLowerCase();
    if (nome.length < 2) throw new BadRequestException('Informe o nome completo.');
    const birth = dto.dataNascimento ? new Date(dto.dataNascimento) : undefined;
    if (birth) assertAdult(birth);
    try {
      return await this.prisma.$transaction(async tx => {
        await lockAdminActor(tx, actor.id);
        await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${id}::uuid FOR UPDATE`;
        const before = await tx.usuario.findUnique({ where: { id }, select: view });
        if (!before) throw new NotFoundException('Usuário não encontrado.');
        const emailChanged = before.email !== email;
        const updated = await tx.usuario.update({ where: { id }, data: { nome, email, ...(dto.telefone !== undefined ? { telefone: dto.telefone.trim() || null } : {}), ...(birth ? { dataNascimento: birth } : {}), ...(emailChanged ? { tokenVersion: { increment: 1 } } : {}) }, select: view });
        if (emailChanged) await tx.tokenSenha.updateMany({ where: { usuarioId: id, usadoEm: null }, data: { usadoEm: new Date() } });
        await this.audit.record(tx, { entidade: 'usuario', entidadeId: id, evento: 'usuario.cadastro_editado', atorId: actor.id, payloadAntes: { nome: before.nome, email: before.email, telefone: before.telefone, dataNascimento: before.dataNascimento.toISOString() }, payloadDepois: { nome, email, telefone: updated.telefone, dataNascimento: updated.dataNascimento.toISOString() } });
        return { ...updated, cpf: mask(updated.cpf), sessoesEncerradas: emailChanged };
      });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') throw new ConflictException('E-mail já cadastrado em outra conta.');
      throw error;
    }
  }
  async setActive(id: string, active: boolean, actor: AuthUser) {
    if (!active && id === actor.id) throw new ConflictException('Você não pode remover seu próprio acesso.');
    return this.prisma.$transaction(async tx => {
      await lockAdminActor(tx, actor.id);
      await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${id}::uuid FOR UPDATE`;
      const target = await tx.usuario.findUnique({ where: { id }, select: { id: true, desativadoEm: true } });
      if (!target) throw new NotFoundException('Usuário não encontrado.');
      if (active === !target.desativadoEm) return { id, ativo: active };
      await tx.usuario.update({ where: { id }, data: { desativadoEm: active ? null : new Date(), tokenVersion: { increment: 1 } } });
      await tx.tokenSenha.updateMany({ where: { usuarioId: id, usadoEm: null }, data: { usadoEm: new Date() } });
      await this.audit.record(tx, { entidade: 'usuario', entidadeId: id, evento: active ? 'usuario.reativado' : 'usuario.acesso_removido', atorId: actor.id, payloadDepois: { ativo: active, historicoPreservado: true } });
      return { id, ativo: active };
    });
  }
  async sendReset(id: string, actor: AuthUser) {
    if (!this.mail.isConfigured()) throw new ServiceUnavailableException('SMTP não configurado. Nenhum e-mail foi enviado.');
    const token = randomBytes(32).toString('base64url');
    const hash = createHash('sha256').update(token).digest('hex');
    const expiraEm = new Date(Date.now() + 60 * 60_000);
    const user = await this.prisma.$transaction(async tx => {
      await lockAdminActor(tx, actor.id);
      await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${id}::uuid FOR UPDATE`;
      const target = await tx.usuario.findUnique({ where: { id }, select: { nome: true, email: true, desativadoEm: true } });
      if (!target) throw new NotFoundException('Usuário não encontrado.');
      if (target.desativadoEm) throw new ConflictException('Reative a conta antes de solicitar uma nova senha.');
      if (await tx.tokenSenha.count({ where: { usuarioId: id, criadoEm: { gt: new Date(Date.now() - 3_600_000) } } }) >= 3) throw new ConflictException('Limite de 3 solicitações por hora. Aguarde antes de reenviar.');
      await tx.tokenSenha.updateMany({ where: { usuarioId: id, usadoEm: null }, data: { usadoEm: new Date() } });
      await tx.tokenSenha.create({ data: { usuarioId: id, tokenHash: hash, expiraEm } });
      await this.audit.record(tx, { entidade: 'usuario', entidadeId: id, evento: 'usuario.redefinicao_solicitada_admin', atorId: actor.id });
      return target;
    });
    let sent = false;
    try { sent = await this.mail.send({ to: user.email, subject: 'Redefinição de senha — Bolão Livre', text: `Olá, ${user.nome}.\n\nO suporte solicitou uma redefinição de senha para sua conta. Use este link pessoal em até 1 hora:\n${this.mail.publicUrl()}/redefinir-senha?token=${encodeURIComponent(token)}\n\nSe você não reconhece a solicitação, ignore o link e procure o suporte. Sua senha atual não foi alterada.` }); } catch { /* Report failure without exposing token or SMTP credentials. */ }
    if (!sent) {
      await this.prisma.tokenSenha.updateMany({ where: { tokenHash: hash, usadoEm: null }, data: { usadoEm: new Date() } });
      await this.audit.record(this.prisma, { entidade: 'usuario', entidadeId: id, evento: 'usuario.redefinicao_email_falhou', atorId: actor.id });
      throw new ServiceUnavailableException('O envio falhou. Confira o SMTP e tente novamente.');
    }
    await this.audit.record(this.prisma, { entidade: 'usuario', entidadeId: id, evento: 'usuario.redefinicao_email_enviado', atorId: actor.id });
    return { enviado: true, expiraEm, mensagem: 'E-mail aceito pelo servidor de envio. Confira também a pasta de spam do destinatário.' };
  }
}
