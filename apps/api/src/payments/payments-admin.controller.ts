import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { SuperAdminGuard } from '../auth/superadmin.guard';
import { CancelShareDto, ManualPaymentDto, ManualSaleDto, RefundShareDto, RejectCancellationDto } from './payments.dto';
import { PaymentsService } from './payments.service';

/** Operação financeira do administrador: baixa manual, venda de balcão, cancelamento e Cora. */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class PaymentsAdminController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('pagamentos/configuracao') @UseGuards(SuperAdminGuard)
  settings() {
    return this.payments.settings();
  }

  @Post('pagamentos/cora/webhooks') @UseGuards(SuperAdminGuard)
  registerWebhooks(@CurrentUser() admin: AuthUser) {
    return this.payments.registerCoraWebhooks(admin.id);
  }

  @Post('pagamentos/conciliar') @UseGuards(SuperAdminGuard)
  reconcile() {
    return this.payments.reconcilePending();
  }

  @Post('cotas/venda-manual')
  manualSale(@Body() dto: ManualSaleDto, @CurrentUser() admin: AuthUser) {
    return this.payments.manualSale(dto, admin);
  }

  @Post('cotas/:id/baixa')
  markPaid(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ManualPaymentDto, @CurrentUser() admin: AuthUser) {
    return this.payments.markPaidManually(id, dto, admin);
  }

  @Post('cotas/:id/cancelar')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelShareDto, @CurrentUser() admin: AuthUser) {
    return this.payments.cancelShare(id, dto, admin);
  }

  /** Pedidos de cancelamento de cota paga feitos pelos clientes. */
  @Get('pedidos-cancelamento')
  async cancellationRequests(@Query('status') status?: string) {
    const [items, abertos] = await Promise.all([this.payments.listCancellationRequests(status), this.payments.countOpenCancellations()]);
    return { items, abertos };
  }

  @Post('pedidos-cancelamento/:id/aprovar')
  approveCancellation(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundShareDto, @CurrentUser() admin: AuthUser) {
    return this.payments.approveCancellation(id, dto, admin);
  }

  @Post('pedidos-cancelamento/:id/recusar')
  rejectCancellation(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RejectCancellationDto, @CurrentUser() admin: AuthUser) {
    return this.payments.rejectCancellation(id, dto, admin);
  }

  /** Estorna uma cota paga e devolve o valor (saldo ou Pix), sem pedido do cliente. */
  @Post('cotas/:id/estornar')
  refund(@Param('id', ParseUUIDPipe) id: string, @Body() dto: RefundShareDto, @CurrentUser() admin: AuthUser) {
    return this.payments.refundShare(id, dto, admin);
  }

  /** Apaga o registro de compra que falhou, venceu ou foi cancelada (não era venda). */
  @Post('cotas/limpar-falhas')
  purgeFailed(@Query('bolaoId') poolId: string | undefined, @CurrentUser() admin: AuthUser) {
    return this.payments.purgeFailedShares(admin, poolId && /^[0-9a-f-]{36}$/i.test(poolId) ? poolId : undefined);
  }

  /** Exclusão total de cota vendida (venda de teste): só superadmin. */
  @Delete('cotas/:id/definitivo') @UseGuards(SuperAdminGuard)
  removeCompletely(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser) {
    return this.payments.deleteShareCompletely(id, admin);
  }

  @Delete('cotas/:id')
  removeFailed(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser) {
    return this.payments.deleteFailedShare(id, admin);
  }
}
