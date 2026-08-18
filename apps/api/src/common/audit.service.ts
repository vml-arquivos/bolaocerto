import { Injectable } from '@nestjs/common';
import { Prisma, PrismaClient } from '@prisma/client';
import { PrismaService } from './prisma.service';

@Injectable()
export class AuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(
    tx: Prisma.TransactionClient | PrismaService,
    input: {
      entidade: string;
      entidadeId: string;
      evento: string;
      atorId?: string;
      payloadAntes?: Prisma.InputJsonValue;
      payloadDepois?: Prisma.InputJsonValue;
    },
  ): Promise<void> {
    await tx.auditoriaEvento.create({
      data: {
        entidade: input.entidade,
        entidadeId: input.entidadeId,
        evento: input.evento,
        atorId: input.atorId,
        payloadAntes: input.payloadAntes,
        payloadDepois: input.payloadDepois,
      },
    });
  }

  get client(): PrismaClient {
    return this.prisma;
  }
}
