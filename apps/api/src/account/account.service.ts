import { BadRequestException, ConflictException, ForbiddenException, Injectable, Logger, NotFoundException, UnauthorizedException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import * as argon2 from 'argon2';
import { createHash, randomBytes } from 'crypto';
import { AuditService } from '../common/audit.service';
import { escapeHtml, MailService, wrapEmailHtml } from '../common/mail.service';
import { PrismaService } from '../common/prisma.service';
import { assertCanManage } from '../admin/superadmin';
import { NotificationsService } from '../notifications/notifications.service';
import { isValidNewPassword, NEW_PASSWORD_MESSAGE } from '../auth/password-policy';
import { detectFileType } from '../attachments/file-type';
import { maskCpfDisplay } from '../shares/receipt';
import { UpdateProfileDto } from './account.dto';

export const PHOTO_KEY_PREFIX = 'foto:';
export const MAX_PHOTO_BYTES = 600 * 1024;

const RESET_TTL_MINUTES = 60;
const RESET_MAX_PER_HOUR = 3;

export const hashResetToken = (token: string) => createHash('sha256').update(token).digest('hex');

@Injectable()
export class AccountService {
  private readonly logger = new Logger(AccountService.name);

  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly mail: MailService, private readonly notifications: NotificationsService) {}

  // ───────── Perfil e foto da própria conta ─────────

  async getProfile(userId: string) {
    const user = await this.prisma.usuario.findUnique({ where: { id: userId }, select: { nome: true, cpf: true, email: true, telefone: true, papel: true, chavePixRecebimento: true, afiliado: { select: { chavePixRepasse: true } } } });
    if (!user) throw new NotFoundException('Conta não encontrada.');
    const photo = await this.prisma.configuracaoSistema.findUnique({ where: { chave: `${PHOTO_KEY_PREFIX}${userId}` }, select: { atualizadoEm: true } });
    return { nome: user.nome, cpf: maskCpfDisplay(user.cpf), email: user.email, telefone: user.telefone, papel: user.papel, chavePix: user.afiliado?.chavePixRepasse ?? user.chavePixRecebimento ?? null, foto: photo ? { versao: photo.atualizadoEm.getTime() } : null };
  }

  async updateProfile(userId: string, dto: UpdateProfileDto) {
    const before = await this.prisma.usuario.findUnique({ where: { id: userId }, select: { nome: true, telefone: true, chavePixRecebimento: true, afiliado: { select: { id: true, chavePixRepasse: true } } } });
    if (!before) throw new NotFoundException('Conta não encontrada.');
    const nome = dto.nome?.trim();
    if (dto.nome !== undefined && (!nome || nome.length < 2)) throw new BadRequestException('Informe o nome completo.');
    const telefone = dto.telefone !== undefined ? dto.telefone.replace(/\D/g, '') : undefined;
    const pix = dto.chavePix !== undefined ? (dto.chavePix.trim() || null) : undefined;
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id: userId }, data: { ...(nome ? { nome } : {}), ...(telefone !== undefined ? { telefone } : {}), ...(pix !== undefined ? { chavePixRecebimento: pix } : {}) } });
      if (pix !== undefined && before.afiliado) await tx.afiliado.update({ where: { id: before.afiliado.id }, data: { chavePixRepasse: pix } });
      await this.audit.record(tx, { entidade: 'usuario', entidadeId: userId, evento: 'usuario.perfil_editado', atorId: userId, payloadAntes: { nome: before.nome, telefone: before.telefone } as unknown as Prisma.InputJsonValue, payloadDepois: { nome: nome ?? before.nome, telefone: telefone ?? before.telefone, pixAlterado: pix !== undefined } as unknown as Prisma.InputJsonValue });
    });
    return this.getProfile(userId);
  }

  /** A foto fica na tabela de configurações (chave foto:<id>), como as imagens da página inicial: sem pasta e sem migração. */
  async savePhoto(userId: string, file: { buffer: Buffer } | undefined) {
    if (!file?.buffer?.length) throw new BadRequestException('Escolha uma imagem.');
    if (file.buffer.length > MAX_PHOTO_BYTES) throw new BadRequestException('Imagem muito grande. Use uma foto de até 600 KB.');
    const type = detectFileType(file.buffer);
    if (!type || type.mime === 'application/pdf') throw new BadRequestException('Use uma imagem PNG, JPG ou WEBP.');
    const chave = `${PHOTO_KEY_PREFIX}${userId}`;
    const valor = `${type.mime};${file.buffer.toString('base64')}`;
    const row = await this.prisma.configuracaoSistema.upsert({ where: { chave }, create: { chave, valor }, update: { valor } });
    return { foto: { versao: row.atualizadoEm.getTime() } };
  }

  async readPhoto(userId: string): Promise<{ mime: string; data: Buffer }> {
    const row = await this.prisma.configuracaoSistema.findUnique({ where: { chave: `${PHOTO_KEY_PREFIX}${userId}` } });
    const sep = row?.valor.indexOf(';') ?? -1;
    if (!row || sep < 0) throw new NotFoundException('Sem foto.');
    return { mime: row.valor.slice(0, sep), data: Buffer.from(row.valor.slice(sep + 1), 'base64') };
  }

  async deletePhoto(userId: string) {
    await this.prisma.configuracaoSistema.deleteMany({ where: { chave: `${PHOTO_KEY_PREFIX}${userId}` } });
    return { foto: null };
  }

  // ───────── Esqueci minha senha ─────────

  /** Resposta idêntica exista ou não o e-mail (não revela quem tem conta). */
  async requestReset(email: string): Promise<{ ok: true; mensagem: string }> {
    const generic = { ok: true as const, mensagem: 'Se o e-mail estiver cadastrado, enviaremos as instruções para criar uma nova senha. O link vale por 1 hora.' };
    const user = await this.prisma.usuario.findUnique({ where: { email: email.toLowerCase().trim() }, select: { id: true, nome: true, email: true, desativadoEm: true } });
    if (!user || user.desativadoEm) return generic;
    const recent = await this.prisma.tokenSenha.count({ where: { usuarioId: user.id, criadoEm: { gt: new Date(Date.now() - 3_600_000) } } });
    if (recent >= RESET_MAX_PER_HOUR) return generic;
    const { token } = await this.issueResetToken(user.id);
    const link = `${this.mail.publicUrl()}/redefinir-senha?token=${encodeURIComponent(token)}`;
    const first = user.nome.split(' ')[0] ?? '';
    const sent = await this.mail.send({
      to: user.email,
      subject: 'Redefinição de senha — BL',
      text: `Olá, ${first}!\n\nRecebemos um pedido para criar uma nova senha no BL — Bolão Livre.\nAcesse o link abaixo (vale por ${RESET_TTL_MINUTES} minutos):\n\n${link}\n\nSe não foi você, ignore este e-mail: sua senha continua a mesma.`,
      html: wrapEmailHtml('Crie uma nova senha', `<p>Olá, ${escapeHtml(first)}!</p><p>Recebemos um pedido para criar uma nova senha no BL — Bolão Livre. O link vale por ${RESET_TTL_MINUTES} minutos.</p><p style="color:#646b86">Se não foi você, ignore este e-mail: sua senha continua a mesma.</p>`, { label: 'Criar nova senha', url: link }),
    });
    if (!sent) this.logger.warn(`Pedido de nova senha registrado para o usuário ${user.id}, mas o e-mail não pôde ser enviado (SMTP). Use o link administrativo de redefinição.`);
    return generic;
  }

  private async issueResetToken(usuarioId: string): Promise<{ token: string; expiraEm: Date }> {
    const token = randomBytes(32).toString('base64url');
    const expiraEm = new Date(Date.now() + RESET_TTL_MINUTES * 60_000);
    await this.prisma.$transaction(async (tx) => {
      await tx.tokenSenha.updateMany({ where: { usuarioId, usadoEm: null }, data: { usadoEm: new Date() } });
      await tx.tokenSenha.create({ data: { usuarioId, tokenHash: hashResetToken(token), expiraEm } });
    });
    return { token, expiraEm };
  }

  /** Suporte: gera o link de redefinição para o administrador entregar ao usuário quando o e-mail não está disponível. */
  async adminResetLink(usuarioId: string, adminId: string) {
    const token = randomBytes(32).toString('base64url');
    const expiraEm = new Date(Date.now() + RESET_TTL_MINUTES * 60_000);
    await this.prisma.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(28471, 1)`;
      const actor = await tx.usuario.findUnique({ where: { id: adminId }, select: { id: true, email: true, papel: true, desativadoEm: true } });
      if (!actor || actor.papel !== 'admin' || actor.desativadoEm) throw new ForbiddenException('Acesso administrativo indisponível.');
      await tx.$queryRaw`SELECT id FROM usuarios WHERE id = ${usuarioId}::uuid FOR UPDATE`;
      const user = await tx.usuario.findUnique({ where: { id: usuarioId }, select: { id: true, email: true, papel: true, desativadoEm: true } });
      if (!user) throw new NotFoundException('Usuário não encontrado.');
      assertCanManage(actor, user);
      if (user.desativadoEm) throw new ConflictException('Reative a conta antes de gerar um link.');
      const recent = await tx.tokenSenha.count({ where: { usuarioId, criadoEm: { gt: new Date(Date.now() - 3_600_000) } } });
      if (recent >= RESET_MAX_PER_HOUR) throw new ConflictException('Limite de 3 solicitações por hora. Aguarde antes de gerar outro link.');
      await tx.tokenSenha.updateMany({ where: { usuarioId, usadoEm: null }, data: { usadoEm: new Date() } });
      await tx.tokenSenha.create({ data: { usuarioId, tokenHash: hashResetToken(token), expiraEm } });
      await this.audit.record(tx, { entidade: 'usuario', entidadeId: usuarioId, evento: 'usuario.link_redefinicao_gerado', atorId: adminId });
    });
    return { link: `${this.mail.publicUrl()}/redefinir-senha?token=${encodeURIComponent(token)}`, expiraEm, aviso: 'Entregue o link somente à própria pessoa. Ele vale por 1 hora e só pode ser usado uma vez. Gerar outro link invalida o anterior.' };
  }

  async resetPassword(token: string, newPassword: string) {
    if (!isValidNewPassword(newPassword)) throw new BadRequestException(NEW_PASSWORD_MESSAGE);
    const row = await this.prisma.tokenSenha.findUnique({ where: { tokenHash: hashResetToken(token) }, include: { usuario: { select: { id: true, email: true, nome: true, desativadoEm: true } } } });
    if (!row || row.usuario.desativadoEm || row.usadoEm || row.expiraEm.getTime() < Date.now()) throw new BadRequestException('Este link expirou ou já foi usado. Peça uma nova redefinição de senha.');
    const hash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction(async (tx) => {
      const claimed = await tx.tokenSenha.updateMany({ where: { id: row.id, usadoEm: null }, data: { usadoEm: new Date() } });
      if (claimed.count !== 1) throw new BadRequestException('Este link expirou ou já foi usado. Peça uma nova redefinição de senha.');
      await tx.usuario.update({ where: { id: row.usuarioId }, data: { senhaHash: hash, tokenVersion: { increment: 1 }, tentativasLogin: 0, bloqueadoAte: null } });
      await tx.tokenSenha.updateMany({ where: { usuarioId: row.usuarioId, usadoEm: null }, data: { usadoEm: new Date() } });
      await this.audit.record(tx, { entidade: 'usuario', entidadeId: row.usuarioId, evento: 'usuario.senha_redefinida', atorId: row.usuarioId });
    });
    void this.mail.send({ to: row.usuario.email, subject: 'Sua senha foi alterada — BL', text: `Olá! A senha da sua conta no BL — Bolão Livre acabou de ser alterada. Se não foi você, peça uma nova redefinição agora e fale com o suporte.` });
    return { ok: true };
  }

  async changePassword(usuarioId: string, currentPassword: string, newPassword: string) {
    const user = await this.prisma.usuario.findUnique({ where: { id: usuarioId }, select: { id: true, email: true, senhaHash: true } });
    if (!user || !(await argon2.verify(user.senhaHash, currentPassword).catch(() => false))) throw new UnauthorizedException('A senha atual está incorreta.');
    if (!isValidNewPassword(newPassword)) throw new BadRequestException(NEW_PASSWORD_MESSAGE);
    if (currentPassword === newPassword) throw new BadRequestException('A nova senha deve ser diferente da atual.');
    const hash = await argon2.hash(newPassword, { type: argon2.argon2id });
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id: usuarioId }, data: { senhaHash: hash, tokenVersion: { increment: 1 }, tentativasLogin: 0, bloqueadoAte: null } });
      await tx.tokenSenha.updateMany({ where: { usuarioId, usadoEm: null }, data: { usadoEm: new Date() } });
      await this.audit.record(tx, { entidade: 'usuario', entidadeId: usuarioId, evento: 'usuario.senha_alterada', atorId: usuarioId });
    });
    void this.mail.send({ to: user.email, subject: 'Sua senha foi alterada — BL', text: 'A senha da sua conta no BL — Bolão Livre acabou de ser alterada. Se não foi você, peça uma nova redefinição agora e fale com o suporte.' });
    return { ok: true };
  }

  // ───────── LGPD ─────────

  /** Cópia dos dados pessoais da própria pessoa (direito de acesso — LGPD art. 18). Nunca inclui a senha. */
  async exportData(usuarioId: string) {
    const user = await this.prisma.usuario.findUniqueOrThrow({
      where: { id: usuarioId },
      select: {
        id: true, nome: true, cpf: true, email: true, telefone: true, dataNascimento: true, papel: true, statusKyc: true, chavePixRecebimento: true, criadoEm: true, exclusaoSolicitadaEm: true,
        enderecoCep: true, enderecoLogradouro: true, enderecoNumero: true, enderecoComplemento: true, enderecoBairro: true, enderecoCidade: true, enderecoUf: true,
        afiliado: { select: { codigoAfiliado: true, statusAprovacao: true, criadoEm: true } },
      },
    });
    const [cotas, mandatos, avisos, interesses] = await Promise.all([
      this.prisma.cota.findMany({
        where: { compradorId: usuarioId }, orderBy: { criadoEm: 'asc' },
        select: { id: true, bolaoId: true, titularNome: true, titularCpf: true, quantidade: true, valorPago: true, status: true, faixaPremio: true, valorPremio: true, criadoEm: true, pagamento: { select: { id: true, metodo: true, valorBruto: true, valorTaxaAdmin: true, valorComissaoAfiliado: true, valorCustoBilhete: true, status: true, confirmadoEm: true, criadoEm: true, notaFiscal: { select: { numero: true, status: true } } } } },
      }),
      this.prisma.mandato.findMany({ where: { usuarioId }, select: { cotaId: true, textoHash: true, textoSnapshot: true, versao: true, pedidoSnapshot: true, ipAceite: true, aceitoEm: true } }),
      this.prisma.notificacao.findMany({ where: { usuarioId }, orderBy: { criadoEm: 'asc' }, select: { tipo: true, payload: true, criadoEm: true, lidoEm: true } }),
      this.prisma.bolaoInteresse.findMany({ where: { usuarioId }, select: { bolaoId: true, criadoEm: true } }),
    ]);
    return {
      geradoEm: new Date().toISOString(),
      observacao: 'Cópia dos seus dados pessoais tratados pelo BL — Bolão Livre. A senha nunca é exibida (guardamos apenas um hash irreversível).',
      cadastro: user, cotasEPagamentos: cotas, aceitesDoMandato: mandatos, avisos, interessesEmBoloes: interesses,
    };
  }

  /**
   * Registra o pedido de exclusão da conta. Dados fiscais e financeiros precisam ser guardados por prazo legal,
   * então o pedido é analisado pela equipe e a conta é anonimizada/encerrada no que a lei permitir.
   */
  async requestDeletion(usuarioId: string, motivo?: string) {
    const user = await this.prisma.usuario.findUniqueOrThrow({ where: { id: usuarioId }, select: { id: true, exclusaoSolicitadaEm: true } });
    if (user.exclusaoSolicitadaEm) throw new ConflictException('Você já solicitou a exclusão da conta. Nossa equipe fará a análise e entrará em contato.');
    const pending = await this.prisma.cota.count({ where: { compradorId: usuarioId, status: { in: ['reservada', 'paga', 'registrada'] } } });
    await this.prisma.$transaction(async (tx) => {
      await tx.usuario.update({ where: { id: usuarioId }, data: { exclusaoSolicitadaEm: new Date() } });
      await this.audit.record(tx, { entidade: 'usuario', entidadeId: usuarioId, evento: 'lgpd.exclusao_solicitada', atorId: usuarioId, payloadDepois: { motivo: motivo ?? null, cotasEmAndamento: pending } as unknown as Prisma.InputJsonValue });
    });
    await this.notifications.notify(usuarioId, 'conta.exclusao_solicitada', { titulo: 'Pedido de exclusão registrado', mensagem: 'Recebemos o seu pedido. Dados fiscais e de pagamento precisam ser mantidos pelo prazo legal; o restante será excluído ou anonimizado após a análise.' });
    return { ok: true, cotasEmAndamento: pending, mensagem: pending > 0 ? 'Pedido registrado. Você tem cotas em andamento: elas serão mantidas até a apuração do concurso e, depois, a conta será analisada para exclusão.' : 'Pedido registrado. Nossa equipe fará a análise e entrará em contato. Dados fiscais e de pagamento são mantidos pelo prazo exigido em lei.' };
  }
}
