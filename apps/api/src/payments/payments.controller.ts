import { Body, Controller, Delete, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CancelShareDto, CreatePaymentDto } from './payments.dto';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('cotas/:id/pagamento')
  @UseGuards(JwtAuthGuard)
  create(@Param('id') id: string, @Body() dto: CreatePaymentDto, @CurrentUser() user: AuthUser) {
    return this.payments.createForShare(id, dto, user);
  }

  /** Paga a cota inteira com o crédito da carteira. */
  @Post('cotas/:id/pagar-com-saldo')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  payWithBalance(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.payments.payWithBalance(id, user);
  }

  /** O cliente cancela a própria compra que ainda não foi paga. */
  @Post('cotas/:id/cancelar')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  cancelOwn(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelShareDto, @CurrentUser() user: AuthUser) {
    return this.payments.cancelOwnShare(id, user, dto);
  }

  /** O cliente pede o cancelamento de uma cota já paga (prazo de arrependimento). */
  @Post('cotas/:id/pedido-cancelamento')
  @UseGuards(JwtAuthGuard)
  requestCancellation(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelShareDto, @CurrentUser() user: AuthUser) {
    return this.payments.requestCancellation(id, user, dto);
  }

  @Delete('cotas/:id/pedido-cancelamento')
  @UseGuards(JwtAuthGuard)
  withdrawCancellation(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.payments.withdrawCancellation(id, user);
  }

  @Get('cotas/:id/pagamento')
  @UseGuards(JwtAuthGuard)
  current(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.payments.getForShare(id, user);
  }

  @Get('pagamentos/metodos')
  methods() {
    const settings = this.payments.settings();
    return { habilitado: settings.habilitado, metodos: settings.metodos, valorMinimo: settings.valorMinimo, valorMinimoPorMetodo: settings.valorMinimoPorMetodo };
  }

  @Post('webhooks/pagamento/:provedor')
  webhook(@Param('provedor') provider: string, @Req() request: Request & { rawBody?: Buffer }, @Headers() headers: Record<string, string | undefined>, @Query() query: Record<string, string | undefined>) {
    const rawBody = request.rawBody?.toString('utf8') ?? JSON.stringify(request.body ?? {});
    return this.payments.handleWebhook(rawBody, headers, query, provider);
  }
}
