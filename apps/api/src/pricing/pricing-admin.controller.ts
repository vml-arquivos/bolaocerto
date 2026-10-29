import { BadRequestException, Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { IsInt, IsUrl, Max, Min } from 'class-validator';
import { Prisma } from '@prisma/client';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.utils';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { officialPriceRows } from './pricing.engine';
class PriceVersionDto {
  @IsInt() @Min(1) @Max(2_147_483_647) valorCentavos!: number;
  @IsUrl({ protocols: ['https'], require_protocol: true }) fonte!: string;
}
@Controller('admin/loterias/precos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class PricingAdminController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}
  @Get('historico')
  history() { return this.prisma.precoLoteria.findMany({ orderBy: { vigenteDesde: 'desc' }, take: 500 }); }
  @Post(':modalidade/:chave')
  async version(@Param('modalidade') modalidade: string, @Param('chave') chave: string, @Body() dto: PriceVersionDto, @CurrentUser() user: AuthUser) {
    if (!officialPriceRows().some(p => p.modalidade === modalidade && p.chave === chave)) throw new BadRequestException('Combinação de aposta não suportada.');
    const host = new URL(dto.fonte).hostname;
    if (!(host === 'caixa.gov.br' || host.endsWith('.caixa.gov.br'))) throw new BadRequestException('Informe uma fonte oficial da Caixa.');
    return this.prisma.$transaction(async tx => {
      await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${modalidade + ':' + chave}))`;
      const now = new Date();
      const current = await tx.precoLoteria.findMany({ where: { modalidade, chave, vigenteAte: null } });
      if (current.some(p => p.vigenteDesde >= now)) throw new BadRequestException('Existe versão futura; revise a vigência antes de alterar.');
      await tx.precoLoteria.updateMany({ where: { modalidade, chave, vigenteAte: null }, data: { vigenteAte: now } });
      const row = await tx.precoLoteria.create({ data: { modalidade, chave, valorCentavos: dto.valorCentavos, fonte: dto.fonte, verificadoEm: now, vigenteDesde: now } });
      await this.audit.record(tx, { entidade: 'preco_loteria', entidadeId: row.id, evento: 'preco.versionado', atorId: user.id, payloadAntes: current as unknown as Prisma.InputJsonValue, payloadDepois: row as unknown as Prisma.InputJsonValue });
      return row;
    });
  }
}
