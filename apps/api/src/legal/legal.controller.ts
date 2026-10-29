import { Body, ConflictException, Controller, Get, Post, Req, UseGuards } from '@nestjs/common';
import { Equals, IsString, Length } from 'class-validator';
import { Request } from 'express';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { approvedDocument, legalDocument } from './documents';
export class AcceptLegalDto {
  @IsString() @Length(64, 64) hash!: string;
  @Equals(true) aceito!: boolean;
}
@Controller()
export class LegalController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  @Get('afiliados/me/contrato')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('afiliado')
  async affiliate(@CurrentUser() user: AuthUser) {
    const affiliate = await this.prisma.afiliado.findUniqueOrThrow({ where: { usuarioId: user.id } });
    const doc = legalDocument('afiliado', affiliate.comissaoPadraoPct.toFixed(2));
    const acceptance = await this.prisma.aceiteLegal.findUnique({ where: { usuarioId_tipo_hash: { usuarioId: user.id, tipo: 'afiliado', hash: doc.hash } } });
    return { ...doc, aceitoEm: acceptance?.aceitoEm ?? null };
  }
  @Post('afiliados/me/contrato/aceitar')
  @UseGuards(JwtAuthGuard, RolesGuard) @Roles('afiliado')
  async accept(@CurrentUser() user: AuthUser, @Body() dto: AcceptLegalDto, @Req() req: Request) {
    const affiliate = await this.prisma.afiliado.findUniqueOrThrow({ where: { usuarioId: user.id } });
    const doc = approvedDocument('afiliado', affiliate.comissaoPadraoPct.toFixed(2));
    if (doc.hash !== dto.hash || dto.aceito !== true) throw new ConflictException('Releia o contrato vigente antes de aceitar.');
    return this.prisma.$transaction(async tx => {
      const accepted = await tx.aceiteLegal.upsert({ where: { usuarioId_tipo_hash: { usuarioId: user.id, tipo: 'afiliado', hash: doc.hash } }, update: {}, create: { usuarioId: user.id, tipo: 'afiliado', hash: doc.hash, versao: doc.versao, texto: doc.texto, ip: req.ip ?? req.socket.remoteAddress ?? 'unknown', userAgent: req.get('user-agent') } });
      await this.audit.record(tx, { entidade: 'usuario', entidadeId: user.id, evento: 'contrato.afiliado_aceito', atorId: user.id, payloadDepois: { hash: doc.hash, aceiteId: accepted.id } });
      return { aceitoEm: accepted.aceitoEm, hash: accepted.hash };
    });
  }
  @Get('conta/contratos') @UseGuards(JwtAuthGuard)
  async mine(@CurrentUser() user: AuthUser) {
    const [participacoes, afiliacao] = await Promise.all([
      this.prisma.mandato.findMany({ where: { usuarioId: user.id }, select: { cotaId: true, textoHash: true, textoSnapshot: true, versao: true, pedidoSnapshot: true, aceitoEm: true }, orderBy: { aceitoEm: 'desc' } }),
      this.prisma.aceiteLegal.findMany({ where: { usuarioId: user.id }, select: { tipo: true, hash: true, versao: true, texto: true, aceitoEm: true }, orderBy: { aceitoEm: 'desc' } }),
    ]);
    return { participacoes, afiliacao };
  }
}
