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
  CreateGroupDto,
  CreateInviteDto,
  CreateManagedUserDto,
  CreatePartnerLotteryDto,
  CreateRemittanceDto,
  DashboardQueryDto,
  OperationReceiptDto,
  PayRemittanceDto,
  UpdateAffiliateCommissionDto,
  UpdateSettingsDto,
  UpdateUserKycDto,
  UpdateUserRoleDto,
  UpdateAffiliateNetworkDto,
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

  @Post('admin/usuarios')
  @Roles('admin')
  createUser(@Body() dto: CreateManagedUserDto, @CurrentUser() user: AuthUser) {
    return this.admin.createManagedUser({ ...dto, papel: 'cotista' }, user);
  }

  @Post('admin/afiliados')
  @Roles('admin')
  createAffiliate(@Body() dto: CreateManagedUserDto, @CurrentUser() user: AuthUser) {
    return this.admin.createManagedUser({ ...dto, papel: 'afiliado' }, user);
  }

  @Post('admin/convites')
  @Roles('admin')
  createAdminInvite(@Body() dto: CreateInviteDto, @CurrentUser() user: AuthUser) {
    return this.admin.createInvite(dto, user);
  }

  @Get('admin/convites')
  @Roles('admin')
  invites(@Query() query: AdminListQueryDto, @CurrentUser() user: AuthUser) {
    return this.admin.listInvites(query, user);
  }

  @Post('admin/grupos')
  @Roles('admin')
  createAdminGroup(@Body() dto: CreateGroupDto, @CurrentUser() user: AuthUser) {
    return this.admin.createGroup(dto, user);
  }

  @Get('admin/grupos')
  @Roles('admin')
  groups(@Query() query: AdminListQueryDto, @CurrentUser() user: AuthUser) {
    return this.admin.listGroups(query, user);
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

  @Post('afiliados/me/convites')
  @Roles('afiliado')
  createAffiliateInvite(@Body() dto: CreateInviteDto, @CurrentUser() user: AuthUser) {
    return this.admin.createInvite({ ...dto, afiliadoOrigemId: undefined }, user);
  }

  @Get('afiliados/me/convites')
  @Roles('afiliado')
  affiliateInvites(@Query() query: AdminListQueryDto, @CurrentUser() user: AuthUser) {
    return this.admin.listInvites(query, user);
  }

  @Post('afiliados/me/grupos')
  @Roles('afiliado')
  createAffiliateGroup(@Body() dto: CreateGroupDto, @CurrentUser() user: AuthUser) {
    return this.admin.createGroup(dto, user);
  }

  @Get('afiliados/me/grupos')
  @Roles('afiliado')
  affiliateGroups(@Query() query: AdminListQueryDto, @CurrentUser() user: AuthUser) {
    return this.admin.listGroups(query, user);
  }

  @Get('afiliados/me/rede')
  @Roles('afiliado')
  affiliateNetwork(@CurrentUser() user: AuthUser) {
    return this.admin.affiliateNetwork(user);
  }

  @Get('afiliados/me/workspace')
  @Roles('afiliado')
  affiliateWorkspace(@CurrentUser() user: AuthUser) {
    return this.admin.affiliateWorkspace(user);
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

  @Patch('admin/afiliados/:id/rede')
  @Roles('admin')
  updateAffiliateNetwork(@Param('id') id: string, @Body() dto: UpdateAffiliateNetworkDto, @CurrentUser() user: AuthUser) {
    return this.admin.updateAffiliateNetwork(id, dto, user);
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
