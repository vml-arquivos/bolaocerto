import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatusBolao, StatusCota } from '@prisma/client';
import { AuthUser } from '../auth/auth.utils';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { RegisterPoolDto } from './operation.dto';

@Injectable()
export class OperationService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async queue() {
    const pools = await this.prisma.bolao.findMany({ where: { status: { in: [StatusBolao.fechado, StatusBolao.aberto] }, cotasVendidas: { gt: 0 } }, include: { concurso: true, lotericaParceira: true }, orderBy: { concurso: { cutoffAt: 'asc' } } });
    return pools.map((pool) => ({ id: pool.id, status: pool.status, modeloOperacional: pool.modeloOperacional, lotericaParceira: pool.lotericaParceira?.razaoSocial ?? null, cutoffAt: pool.concurso.cutoffAt, cotasVendidas: pool.cotasVendidas, totalCotas: pool.totalCotas }));
  }

  async register(poolId: string, dto: RegisterPoolDto, user: AuthUser) {
    const pool = await this.prisma.bolao.findUnique({ where: { id: poolId }, include: { cotas: true } });
    if (!pool) throw new NotFoundException('Bolão não encontrado.');
    const registrableStatuses: StatusBolao[] = [StatusBolao.aberto, StatusBolao.fechado];
    if (!registrableStatuses.includes(pool.status)) throw new ConflictException('Bolão não está disponível para registro.');
    if (pool.cotas.length === 0 || pool.cotas.some((share) => share.status !== StatusCota.paga)) throw new ConflictException('Todas as cotas devem estar confirmadas antes do registro.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const registered = await tx.bolao.update({ where: { id: poolId }, data: { status: StatusBolao.registrado, comprovanteUrl: dto.comprovanteUrl, registradoEm: new Date() } });
      await tx.cota.updateMany({ where: { bolaoId: poolId, status: StatusCota.paga }, data: { status: StatusCota.registrada, comprovanteIndividualUrl: dto.comprovanteUrl } });
      await this.audit.record(tx, { entidade: 'bolao', entidadeId: poolId, evento: 'aposta.registrada', atorId: user.id, payloadAntes: pool as unknown as Prisma.InputJsonValue, payloadDepois: registered as unknown as Prisma.InputJsonValue });
      for (const share of pool.cotas) {
        await this.audit.record(tx, { entidade: 'cota', entidadeId: share.id, evento: 'cota.registrada', atorId: user.id, payloadAntes: share as unknown as Prisma.InputJsonValue, payloadDepois: { status: 'registrada', comprovanteUrl: dto.comprovanteUrl } });
      }
      return registered;
    });
    return { id: updated.id, status: updated.status, comprovanteUrl: updated.comprovanteUrl, registradoEm: updated.registradoEm };
  }
}
