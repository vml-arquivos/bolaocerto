import { Body, Controller, Param, Post, Req, Headers, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { CreatePaymentDto } from './payments.dto';
import { PaymentsService } from './payments.service';

@Controller()
export class PaymentsController {
  constructor(private readonly payments: PaymentsService) {}

  @Post('cotas/:id/pagamento')
  @UseGuards(JwtAuthGuard)
  create(@Param('id') id: string, @Body() dto: CreatePaymentDto, @CurrentUser() user: AuthUser) {
    return this.payments.createForShare(id, dto, user);
  }

  @Post('webhooks/pagamento/:provedor')
  webhook(@Req() request: Request & { rawBody?: Buffer }, @Headers() headers: Record<string, string | undefined>) {
    const rawBody = request.rawBody?.toString('utf8') ?? JSON.stringify(request.body ?? {});
    return this.payments.handleWebhook(rawBody, headers);
  }
}
