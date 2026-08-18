import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminService } from './admin.service';
import { ApproveAffiliateDto, CreateAffiliateDto, CreatePartnerLotteryDto } from './admin.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Post('admin/lotericas')
  @Roles('admin')
  createPartner(@Body() dto: CreatePartnerLotteryDto, @CurrentUser() user: AuthUser) {
    return this.admin.createPartner(dto, user);
  }

  @Post('afiliados/solicitar')
  @Roles('cotista', 'afiliado')
  requestAffiliate(@Body() dto: CreateAffiliateDto, @CurrentUser() user: AuthUser) {
    return this.admin.requestAffiliate(user, dto);
  }

  @Get('afiliados/me/dashboard')
  @Roles('afiliado')
  dashboard(@CurrentUser() user: AuthUser) {
    return this.admin.affiliateDashboard(user);
  }

  @Get('afiliados/me/comissoes')
  @Roles('afiliado')
  commissions(@CurrentUser() user: AuthUser) {
    return this.admin.affiliateCommissions(user);
  }

  @Post('admin/afiliados/:id/aprovar')
  @Roles('admin')
  approve(@Param('id') id: string, @Body() dto: ApproveAffiliateDto, @CurrentUser() user: AuthUser) {
    return this.admin.approveAffiliate(id, dto, user);
  }

  @Get('admin/financeiro/conciliacao')
  @Roles('admin')
  reconciliation(@CurrentUser() user: AuthUser) {
    return this.admin.financialReconciliation(user);
  }
}
