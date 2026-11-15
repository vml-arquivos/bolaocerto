import { Body, Controller, Get, NotFoundException, Param, ParseUUIDPipe, Put, Query, UseGuards } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsNumber, IsOptional, IsString, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.utils';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { SuperAdminGuard } from '../auth/superadmin.guard';
import { assertOwnsAffiliate, isSuperAdmin } from '../admin/superadmin';
import { buildRanking, RANKING_PERIODS, RankingPeriod, rankingStart } from './affiliate-ranking';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { affiliateLimits, LEVEL_NAMES, LEVELS, levelKey, normalizeLevel, normalizeRules, readLevel, readRules, RULES_KEY } from './affiliate-rules';

class LimitDto {
  @Type(() => Number) @IsNumber() @Min(1) @Max(100000) maxCotas!: number;
  @Type(() => Number) @IsNumber() @Min(0.01) @Max(1000000) maxValorCota!: number;
}
class LevelsDto {
  @ValidateNested() @Type(() => LimitDto) bronze!: LimitDto;
  @ValidateNested() @Type(() => LimitDto) prata!: LimitDto;
  @ValidateNested() @Type(() => LimitDto) ouro!: LimitDto;
  @ValidateNested() @Type(() => LimitDto) diamante!: LimitDto;
}
class RequirementsDto {
  @IsOptional() @IsString() @MaxLength(600) bronze?: string;
  @IsOptional() @IsString() @MaxLength(600) prata?: string;
  @IsOptional() @IsString() @MaxLength(600) ouro?: string;
  @IsOptional() @IsString() @MaxLength(600) diamante?: string;
}
export class SaveRulesDto {
  @ValidateNested() @Type(() => LevelsDto) niveis!: LevelsDto;
  /** Pré-requisitos de cada nível (preenchidos depois). */
  @IsOptional() @ValidateNested() @Type(() => RequirementsDto) requisitos?: RequirementsDto;
  @Type(() => Number) @IsNumber() @Min(0) @Max(100) comissaoMaxPct!: number;
  @IsBoolean() comissaoTravada!: boolean;
}
export class SaveLevelDto {
  @IsIn(LEVELS as unknown as string[]) nivel!: string;
  /** Limite manual autorizado pelo administrador; null = usar o do nível. */
  @IsOptional() @ValidateNested() @Type(() => LimitDto) manual?: LimitDto | null;
}

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AffiliateRulesController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async save(key: string, value: unknown) {
    await this.prisma.configuracaoSistema.upsert({ where: { chave: key }, create: { chave: key, valor: JSON.stringify(value) }, update: { valor: JSON.stringify(value) } });
  }

  /** Regras gerais (níveis e teto da comissão): qualquer administrador consulta. */
  @Get('admin/afiliados-regras') @Roles('admin')
  async rules() { return { ...(await readRules(this.prisma)), nomes: LEVEL_NAMES }; }

  /** Só a conta principal muda os limites dos níveis e trava/destrava a comissão. */
  @Put('admin/afiliados-regras') @Roles('admin') @UseGuards(SuperAdminGuard)
  async saveRules(@Body() dto: SaveRulesDto, @CurrentUser() user: AuthUser) {
    const before = await readRules(this.prisma);
    const next = normalizeRules({ ...dto, requisitos: { ...before.requisitos, ...(dto.requisitos ?? {}) } });
    await this.save(RULES_KEY, next);
    await this.audit.record(this.prisma, { entidade: 'configuracao', entidadeId: user.id, evento: 'afiliado.regras.alteradas', atorId: user.id, payloadAntes: before as unknown as Prisma.InputJsonValue, payloadDepois: next as unknown as Prisma.InputJsonValue });
    return { ...next, nomes: LEVEL_NAMES };
  }

  /** Nível de um afiliado e, se houver, o limite manual autorizado. */
  @Get('admin/afiliados/:id/nivel') @Roles('admin')
  async level(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    const affiliate = await this.prisma.afiliado.findUnique({ where: { id }, select: { id: true, aprovadoPor: true } });
    if (!affiliate) throw new NotFoundException('Afiliado não encontrado.');
    assertOwnsAffiliate(user, affiliate.aprovadoPor);
    return affiliateLimits(this.prisma, id);
  }

  /** O administrador do afiliado define o nível e pode autorizar um limite manual. */
  @Put('admin/afiliados/:id/nivel') @Roles('admin')
  async saveLevel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveLevelDto, @CurrentUser() user: AuthUser) {
    const affiliate = await this.prisma.afiliado.findUnique({ where: { id }, select: { id: true, aprovadoPor: true, usuarioId: true } });
    if (!affiliate) throw new NotFoundException('Afiliado não encontrado.');
    assertOwnsAffiliate(user, affiliate.aprovadoPor);
    const before = await readLevel(this.prisma, id);
    const next = normalizeLevel({ nivel: dto.nivel, manual: dto.manual ?? null });
    await this.save(levelKey(id), next);
    await this.audit.record(this.prisma, { entidade: 'afiliado', entidadeId: id, evento: 'afiliado.nivel.alterado', atorId: user.id, payloadAntes: before as unknown as Prisma.InputJsonValue, payloadDepois: next as unknown as Prisma.InputJsonValue });
    return affiliateLimits(this.prisma, id);
  }

  /**
   * Ranking de vendas dos afiliados (quem mais vendeu): conta as cotas com pagamento confirmado vendidas pelo link de cada afiliado.
   * Atualiza na hora — a tela consulta de novo a cada poucos segundos. Administrador comum vê só os afiliados que ele trouxe.
   */
  @Get('admin/afiliados-ranking') @Roles('admin')
  async ranking(@Query('periodo') periodo: string | undefined, @CurrentUser() user: AuthUser) {
    const period: RankingPeriod = (RANKING_PERIODS as readonly string[]).includes(periodo ?? '') ? periodo as RankingPeriod : 'mes';
    const start = rankingStart(period);
    const scope = isSuperAdmin(user) ? {} : { aprovadoPor: user.id };
    const payments = await this.prisma.pagamento.findMany({
      where: {
        status: 'confirmado',
        ...(start ? { confirmadoEm: { gte: start } } : {}),
        cota: { afiliadoReferenciaId: { not: null }, status: { in: ['paga', 'registrada', 'apurada', 'premiada'] }, afiliadoReferencia: scope },
      },
      select: { valorBruto: true, confirmadoEm: true, cota: { select: { quantidade: true, afiliadoReferenciaId: true, compradorId: true, bolaoId: true } } },
    });
    const sales = payments.filter((row) => row.cota?.afiliadoReferenciaId).map((row) => ({ afiliadoId: row.cota!.afiliadoReferenciaId!, quantidade: row.cota!.quantidade, valor: Number(row.valorBruto), compradorId: row.cota!.compradorId, bolaoId: row.cota!.bolaoId, confirmadoEm: row.confirmadoEm }));
    const ids = [...new Set(sales.map((sale) => sale.afiliadoId))];
    const affiliates = ids.length ? await this.prisma.afiliado.findMany({ where: { id: { in: ids } }, select: { id: true, codigoAfiliado: true, usuario: { select: { nome: true } } } }) : [];
    const rows = buildRanking(sales, affiliates.map((item) => ({ id: item.id, nome: item.usuario.nome, codigo: item.codigoAfiliado })));
    const levels = await Promise.all(rows.map((row) => readLevel(this.prisma, row.afiliadoId)));
    const totalAffiliates = await this.prisma.afiliado.count({ where: { statusAprovacao: 'aprovado', ...scope } });
    return {
      periodo: period,
      desde: start ? start.toISOString() : null,
      atualizadoEm: new Date().toISOString(),
      totais: { cotas: rows.reduce((sum, row) => sum + row.cotas, 0), valor: Math.round(rows.reduce((sum, row) => sum + row.valor, 0) * 100) / 100, vendas: rows.reduce((sum, row) => sum + row.vendas, 0), afiliadosComVenda: rows.length, afiliados: totalAffiliates },
      itens: rows.map((row, index) => ({ ...row, nivel: levels[index]!.nivel, nomeNivel: LEVEL_NAMES[levels[index]!.nivel] })),
    };
  }

  /** O próprio afiliado vê o nível e os limites para criar bolões. */
  @Get('afiliados/me/limites') @Roles('afiliado')
  async mine(@CurrentUser() user: AuthUser) {
    const affiliate = await this.prisma.afiliado.findUnique({ where: { usuarioId: user.id }, select: { id: true } });
    if (!affiliate) throw new NotFoundException('Usuário ainda não possui cadastro de afiliado.');
    return affiliateLimits(this.prisma, affiliate.id);
  }
}
