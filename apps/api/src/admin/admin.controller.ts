import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminService } from './admin.service';
import {
  AdminListQueryDto,
  ApproveAffiliateDto,
  CreateAffiliateDto,
  CreatePartnerLotteryDto,
  CreateRemittanceDto,
  DashboardQueryDto,
  OperationReceiptDto,
  PayRemittanceDto,
  UpdateAffiliateCommissionDto,
  UpdateSettingsDto,
  UpdateUserKycDto,
  UpdateUserRoleDto,
} from './admin.dto';

@Controller()
@UseGuards(JwtAuthGuard, RolesGuard)
export class AdminController {
  constructor(private readonly admin: AdminService) {}

  @Get('admin/dashboard')
  @Roles('admin')
  dashboard(@Query() query: DashboardQueryDto, @CurrentUser() user: AuthUser) {
    return this.admin.dashboard(query, user);
  }

  @Get('admin/concursos')
  @Roles('admin')
  contests(@Query() query: AdminListQueryDto) {
    return this.admin.listContests(query);
  }

  @Get('admin/boloes')
  @Roles('admin')
  pools(@Query() query: AdminListQueryDto) {
    return this.admin.listPools(query);
  }

  @Get('admin/cotas')
  @Roles('admin')
  shares(@Query() query: AdminListQueryDto) {
    return this.admin.listShares(query);
  }

  @Get('admin/recebimentos')
  @Roles('admin')
  payments(@Query() query: AdminListQueryDto) {
    return this.admin.listPayments(query);
  }

  @Get('admin/afiliados')
  @Roles('admin')
  affiliates(@Query() query: AdminListQueryDto) {
    return this.admin.listAffiliates(query);
  }

  @Get('admin/comissoes')
  @Roles('admin')
  commissions(@Query() query: AdminListQueryDto) {
    return this.admin.listCommissions(query);
  }

  @Get('admin/repasses')
  @Roles('admin')
  remittances(@Query() query: AdminListQueryDto) {
    return this.admin.listRemittances(query);
  }

  @Post('admin/repasses')
  @Roles('admin')
  createRemittance(@Body() dto: CreateRemittanceDto, @CurrentUser() user: AuthUser) {
    return this.admin.createRemittance(dto, user);
  }

  @Post('admin/repasses/:id/pagar')
  @Roles('admin')
  payRemittance(@Param('id') id: string, @Body() dto: PayRemittanceDto, @CurrentUser() user: AuthUser) {
    return this.admin.payRemittance(id, dto, user);
  }

  @Get('admin/usuarios')
  @Roles('admin')
  users(@Query() query: AdminListQueryDto) {
    return this.admin.listUsers(query);
  }

  @Patch('admin/usuarios/:id/papel')
  @Roles('admin')
  updateUserRole(@Param('id') id: string, @Body() dto: UpdateUserRoleDto, @CurrentUser() user: AuthUser) {
    return this.admin.updateUserRole(id, dto, user);
  }

  @Patch('admin/usuarios/:id/kyc')
  @Roles('admin')
  updateUserKyc(@Param('id') id: string, @Body() dto: UpdateUserKycDto, @CurrentUser() user: AuthUser) {
    return this.admin.updateUserKyc(id, dto, user);
  }

  @Get('admin/operacao')
  @Roles('admin', 'operacao')
  operation(@Query() query: AdminListQueryDto) {
    return this.admin.listOperations(query);
  }

  @Post('admin/operacao/boloes/:id/comprovante')
  @Roles('admin', 'operacao')
  operationReceipt(@Param('id') id: string, @Body() dto: OperationReceiptDto, @CurrentUser() user: AuthUser) {
    return this.admin.registerOperationReceipt(id, dto, user);
  }

  @Get('admin/lotericas')
  @Roles('admin')
  partners(@Query() query: AdminListQueryDto) {
    return this.admin.listPartners(query);
  }

  @Get('admin/auditoria')
  @Roles('admin')
  audits(@Query() query: AdminListQueryDto) {
    return this.admin.listAudits(query);
  }

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
  affiliateDashboard(@CurrentUser() user: AuthUser) {
    return this.admin.affiliateDashboard(user);
  }

  @Get('afiliados/me/comissoes')
  @Roles('afiliado')
  affiliateCommissions(@CurrentUser() user: AuthUser) {
    return this.admin.affiliateCommissions(user);
  }

  @Post('admin/afiliados/:id/aprovar')
  @Roles('admin')
  approve(@Param('id') id: string, @Body() dto: ApproveAffiliateDto, @CurrentUser() user: AuthUser) {
    return this.admin.approveAffiliate(id, dto, user);
  }

  @Patch('admin/afiliados/:id/comissao')
  @Roles('admin')
  updateAffiliateCommission(@Param('id') id: string, @Body() dto: UpdateAffiliateCommissionDto, @CurrentUser() user: AuthUser) {
    return this.admin.updateAffiliateCommission(id, dto, user);
  }

  @Get('admin/financeiro/conciliacao')
  @Roles('admin')
  reconciliation(@CurrentUser() user: AuthUser) {
    return this.admin.financialReconciliation(user);
  }

  @Patch('admin/configuracoes')
  @Roles('admin')
  settings(@Body() dto: UpdateSettingsDto, @CurrentUser() user: AuthUser) {
    return this.admin.updateSettings(dto, user);
  }
}
