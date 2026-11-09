import { Body, Controller, Get, HttpCode, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsOptional, IsString, Matches } from 'class-validator';
import { Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { FUNNEL_EVENTS, FunnelEvent, FunnelService } from './funnel.service';

export class FunnelEventDto { @IsIn(FUNNEL_EVENTS as unknown as string[]) nome!: FunnelEvent }
export class FunnelQueryDto {
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) de?: string;
  @IsOptional() @IsString() @Matches(/^\d{4}-\d{2}-\d{2}$/) ate?: string;
}

/** Contagem pública e anônima das etapas do navegador. Só aceita os nomes da lista e só soma 1. */
@Controller('funil')
export class FunnelPublicController {
  constructor(private readonly funnel: FunnelService) {}
  @Post('evento') @HttpCode(200)
  async event(@Body() dto: FunnelEventDto) { await this.funnel.record(dto.nome); return { ok: true }; }
}

@Controller('admin/funil')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class FunnelAdminController {
  constructor(private readonly funnel: FunnelService) {}
  @Get() report(@Query() query: FunnelQueryDto) { return this.funnel.report(query.de, query.ate); }
}
