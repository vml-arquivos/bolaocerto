import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, PayloadTooLargeException, UnprocessableEntityException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { createHash } from 'crypto';
import { AuthUser } from '../auth/auth.utils';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { UpdateAttachmentDto, UploadAttachmentDto } from './attachments.dto';
import { ALLOWED_DESCRIPTION, detectFileType, safeFileName } from './file-type';
import { PROOF_TYPES, hasProofFile } from './proof';
import { StorageService } from './storage.service';

export interface UploadedFileLike { originalname?: string; mimetype?: string; size?: number; buffer?: Buffer }

const toView = (item: { id: string; bolaoId: string; cotaId: string | null; tipo: string; nomeOriginal: string; mime: string; tamanho: number; sha256: string; descricao: string | null; visivelParticipantes: boolean; criadoEm: Date; autor?: { nome: string } | null }) => ({
  id: item.id, bolaoId: item.bolaoId, cotaId: item.cotaId, tipo: item.tipo, nome: item.nomeOriginal, mime: item.mime, tamanho: item.tamanho, sha256: item.sha256,
  descricao: item.descricao, visivelParticipantes: item.visivelParticipantes, enviadoEm: item.criadoEm, enviadoPor: item.autor?.nome ?? null,
});


@Injectable()
export class AttachmentsService {
  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly audit: AuditService, private readonly notifications: NotificationsService) {}

  async upload(poolId: string, file: UploadedFileLike | undefined, dto: UploadAttachmentDto, user: AuthUser) {
    if (!file?.buffer?.length) throw new BadRequestException('Escolha um arquivo para enviar.');
    if (file.buffer.length > this.storage.maxBytes()) throw new PayloadTooLargeException(`O arquivo passa de ${Math.round(this.storage.maxBytes() / 1024 / 1024)} MB.`);
    const detected = detectFileType(file.buffer);
    if (!detected) throw new UnprocessableEntityException(`Formato não aceito. Envie ${ALLOWED_DESCRIPTION}.`);

    const pool = await this.prisma.bolao.findUnique({ where: { id: poolId }, select: { id: true, status: true } });
    if (!pool) throw new NotFoundException('Bolão não encontrado.');
    if (dto.tipo === 'recibo_cota' && !dto.cotaId) throw new BadRequestException('Escolha a cota a que este recibo pertence.');
    if (dto.tipo !== 'recibo_cota' && dto.cotaId) throw new BadRequestException('Só o recibo individual é ligado a uma cota.');
    let buyerId: string | null = null;
    if (dto.cotaId) {
      const share = await this.prisma.cota.findUnique({ where: { id: dto.cotaId }, select: { bolaoId: true, compradorId: true, status: true } });
      if (!share || share.bolaoId !== poolId) throw new NotFoundException('Cota não encontrada neste bolão.');
      if (share.status === 'cancelada' || share.status === 'estornada') throw new ConflictException('Esta cota foi cancelada.');
      buyerId = share.compradorId;
    }

    const sha256 = createHash('sha256').update(file.buffer).digest('hex');
    const duplicate = await this.prisma.anexo.findFirst({ where: { bolaoId: poolId, sha256, removidoEm: null, cotaId: dto.cotaId ?? null }, select: { id: true } });
    if (duplicate) throw new ConflictException('Este mesmo arquivo já foi anexado.');

    const key = await this.storage.save(file.buffer, detected.ext);
    try {
      const created = await this.prisma.$transaction(async (tx) => {
        await tx.$queryRaw`SELECT id FROM boloes WHERE id = ${poolId}::uuid FOR UPDATE`;
        const row = await tx.anexo.create({
          data: { bolaoId: poolId, cotaId: dto.cotaId ?? null, tipo: dto.tipo, nomeOriginal: safeFileName(file.originalname, detected.ext), mime: detected.mime, tamanho: file.buffer!.length, sha256, caminho: key, descricao: dto.descricao?.trim() || null, visivelParticipantes: dto.visivelParticipantes ?? true, enviadoPor: user.id },
          include: { autor: { select: { nome: true } } },
        });
        await this.audit.record(tx, { entidade: 'bolao', entidadeId: poolId, evento: 'anexo.enviado', atorId: user.id, payloadDepois: { anexoId: row.id, tipo: row.tipo, nome: row.nomeOriginal, tamanho: row.tamanho, sha256, cotaId: row.cotaId } as unknown as Prisma.InputJsonValue });
        if (buyerId && row.visivelParticipantes) {
          await this.notifications.notify(buyerId, 'cota.recibo', { titulo: 'Recibo da sua cota disponível', mensagem: 'O recibo da sua cota já está na sua conta. Guarde-o: é a sua prova de participação.', link: '/minha-conta' }, tx);
        }
        if (!row.cotaId && row.visivelParticipantes) await this.notifyParticipants(tx, row.bolaoId, row.id);
        return row;
      });
      return toView(created);
    } catch (error) {
      await this.storage.remove(key);
      throw error;
    }
  }

  private async notifyParticipants(tx: Prisma.TransactionClient, poolId: string, attachmentId: string, shareId?: string | null) {
    const buyers = await tx.cota.findMany({ where: { bolaoId: poolId, ...(shareId ? { id: shareId } : {}), status: { in: ['paga', 'registrada', 'apurada', 'premiada'] } }, select: { compradorId: true }, distinct: ['compradorId'] });
    for (const buyer of buyers) await this.notifications.notify(buyer.compradorId, 'cota.recibo', { titulo: 'Comprovante disponível', mensagem: 'Um comprovante da sua participação foi disponibilizado. Entre na sua conta para consultar e baixar o arquivo.', bolaoId: poolId, anexoId: attachmentId, link: '/minha-conta' }, tx);
  }

  async listForPool(poolId: string) {
    const rows = await this.prisma.anexo.findMany({ where: { bolaoId: poolId, removidoEm: null }, include: { autor: { select: { nome: true } }, cota: { select: { titularNome: true, quantidade: true } } }, orderBy: { criadoEm: 'desc' } });
    return rows.map((row) => ({ ...toView(row), titular: row.cota?.titularNome ?? null }));
  }

  /** Cotas ativas do bolão, para ligar um recibo individual a uma cota. */
  async listShares(poolId: string) {
    const rows = await this.prisma.cota.findMany({ where: { bolaoId: poolId, status: { notIn: ['cancelada', 'estornada', 'reservada'] } }, select: { id: true, titularNome: true, quantidade: true, status: true }, orderBy: { criadoEm: 'asc' }, take: 500 });
    return rows;
  }

  /** Só dados do arquivo (nunca o conteúdo) dos anexos do bolão que o público pode conhecer. */
  async publicList(poolId: string) {
    const rows = await this.prisma.anexo.findMany({ where: { bolaoId: poolId, removidoEm: null, cotaId: null, visivelParticipantes: true }, orderBy: { criadoEm: 'asc' } });
    return rows.map((row) => ({ id: row.id, tipo: row.tipo, nome: row.nomeOriginal, mime: row.mime, tamanho: row.tamanho, sha256: row.sha256, enviadoEm: row.criadoEm }));
  }

  /** Recibos e comprovantes que a pessoa pode abrir: os do bolão (visíveis) e os das suas próprias cotas. */
  async listMine(user: AuthUser) {
    const rows = await this.prisma.anexo.findMany({
      where: {
        removidoEm: null, visivelParticipantes: true,
        OR: [
          { cota: { compradorId: user.id, status: { notIn: ['cancelada', 'estornada'] } } },
          { cotaId: null, bolao: { cotas: { some: { compradorId: user.id, status: { in: ['paga', 'registrada', 'premiada', 'apurada'] } } } } },
        ],
      },
      include: { bolao: { select: { id: true, concurso: { select: { modalidade: true, numeroConcurso: true } } } } },
      orderBy: { criadoEm: 'desc' }, take: 200,
    });
    return rows.map((row) => ({ id: row.id, bolaoId: row.bolaoId, cotaId: row.cotaId, tipo: row.tipo, nome: row.nomeOriginal, tamanho: row.tamanho, enviadoEm: row.criadoEm, modalidade: row.bolao.concurso.modalidade, concurso: row.bolao.concurso.numeroConcurso }));
  }

  async update(id: string, dto: UpdateAttachmentDto, user: AuthUser) {
    const current = await this.prisma.anexo.findFirst({ where: { id, removidoEm: null } });
    if (!current) throw new NotFoundException('Arquivo não encontrado.');
    const updated = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM boloes WHERE id = ${current.bolaoId}::uuid FOR UPDATE`;
      const latest = await tx.anexo.findFirst({ where: { id, removidoEm: null } });
      if (!latest) throw new NotFoundException('Arquivo não encontrado.');
      const row = await tx.anexo.update({ where: { id }, data: { ...(dto.visivelParticipantes !== undefined ? { visivelParticipantes: dto.visivelParticipantes } : {}), ...(dto.descricao !== undefined ? { descricao: dto.descricao.trim() || null } : {}) }, include: { autor: { select: { nome: true } } } });
      await this.audit.record(tx, { entidade: 'bolao', entidadeId: current.bolaoId, evento: 'anexo.alterado', atorId: user.id, payloadAntes: { visivelParticipantes: current.visivelParticipantes, descricao: current.descricao }, payloadDepois: { visivelParticipantes: row.visivelParticipantes, descricao: row.descricao, anexoId: id } as unknown as Prisma.InputJsonValue });
      if (!latest.visivelParticipantes && row.visivelParticipantes) await this.notifyParticipants(tx, row.bolaoId, row.id, row.cotaId);
      return row;
    });
    return toView(updated);
  }

  /** Remoção lógica: o registro e o arquivo ficam guardados para auditoria; só deixam de aparecer. */
  async remove(id: string, user: AuthUser) {
    const current = await this.prisma.anexo.findFirst({ where: { id, removidoEm: null }, include: { bolao: { select: { status: true, comprovanteUrl: true } } } });
    if (!current) throw new NotFoundException('Arquivo não encontrado.');
    if ((PROOF_TYPES as readonly string[]).includes(current.tipo) && ['registrado', 'apurado'].includes(current.bolao.status) && !current.bolao.comprovanteUrl) {
      const others = await this.prisma.anexo.count({ where: { bolaoId: current.bolaoId, removidoEm: null, id: { not: id }, tipo: { in: [...PROOF_TYPES] } } });
      if (others === 0) throw new ConflictException('Este bolão já foi apostado e este é o único comprovante. Envie outro antes de remover este.');
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.anexo.update({ where: { id }, data: { removidoEm: new Date(), removidoPor: user.id } });
      await this.audit.record(tx, { entidade: 'bolao', entidadeId: current.bolaoId, evento: 'anexo.removido', atorId: user.id, payloadAntes: { anexoId: id, tipo: current.tipo, nome: current.nomeOriginal, sha256: current.sha256 } as unknown as Prisma.InputJsonValue });
    });
    return { ok: true };
  }

  /** Quem pode abrir: equipe sempre; cliente só o que é visível e é do bolão em que participa (ou da sua própria cota). */
  async openFor(id: string, user: AuthUser) {
    const row = await this.prisma.anexo.findFirst({ where: { id, removidoEm: null }, include: { cota: { select: { compradorId: true, status: true } } } });
    if (!row) throw new NotFoundException('Arquivo não encontrado.');
    const staff = user.papel === 'admin' || user.papel === 'operacao';
    if (!staff) {
      if (!row.visivelParticipantes) throw new ForbiddenException('Você não tem acesso a este arquivo.');
      if (row.cotaId) {
        if (row.cota?.compradorId !== user.id) throw new ForbiddenException('Você não tem acesso a este arquivo.');
      } else {
        const participates = await this.prisma.cota.count({ where: { bolaoId: row.bolaoId, compradorId: user.id, status: { in: ['paga', 'registrada', 'premiada', 'apurada'] } } });
        if (!participates) throw new ForbiddenException('Só quem participa deste bolão pode abrir o comprovante.');
      }
    }
    if (!(await this.storage.exists(row.caminho))) throw new NotFoundException('O arquivo não está mais no servidor. Avise o suporte técnico.');
    return { stream: this.storage.open(row.caminho), mime: row.mime, nome: row.nomeOriginal, tamanho: row.tamanho, sha256: row.sha256 };
  }

  /** Há ao menos um comprovante em arquivo para este bolão? */
  async hasProof(poolId: string): Promise<boolean> {
    return hasProofFile(this.prisma, poolId);
  }
}
