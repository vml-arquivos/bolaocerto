import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AffiliateCrmService } from './crm-afiliado.service';
import { AffiliateCrmProfileDto, CrmListQueryDto } from './crm.dto';

@Controller('afiliados/me/crm')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('afiliado')
export class AffiliateCrmController {
  constructor(private readonly crm: AffiliateCrmService) {}

  @Get('resumo')
  overview(@CurrentUser() user: AuthUser) { return this.crm.overview(user); }

  @Get('clientes')
  list(@Query() query: CrmListQueryDto, @CurrentUser() user: AuthUser) { return this.crm.list({ ...query, formato: undefined }, user); }

  @Get('clientes/:id')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.crm.detail(id, user); }

  @Patch('clientes/:id')
  profile(@Param('id', ParseUUIDPipe) id: string, @Body() dto: AffiliateCrmProfileDto, @CurrentUser() user: AuthUser) { return this.crm.updateProfile(id, dto, user); }
}
