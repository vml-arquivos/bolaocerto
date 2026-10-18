import { Body, Controller, Get, Param, ParseUUIDPipe, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CancelShareDto, ManualPaymentDto, ManualSaleDto } from './payments.dto';
import { PaymentsService } from './payments.service';

/** Operação financeira do administrador: baixa manual, venda de balcão, cancelamento e Cora. */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class PaymentsAdminController {
  constructor(private readonly payments: PaymentsService) {}

  @Get('pagamentos/configuracao')
  settings() {
    return this.payments.settings();
  }

  @Post('pagamentos/cora/webhooks')
  registerWebhooks(@CurrentUser() admin: AuthUser) {
    return this.payments.registerCoraWebhooks(admin.id);
  }

  @Post('pagamentos/conciliar')
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
}
