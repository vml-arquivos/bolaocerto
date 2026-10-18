import { Controller, Get, Param, ParseUUIDPipe, Query } from '@nestjs/common';
import { SharesService } from './shares.service';

/** Verificação pública do código do recibo (sem login e sem dados pessoais sensíveis). */
@Controller('recibos')
export class ReceiptVerifyController {
  constructor(private readonly shares: SharesService) {}

  @Get(':id/verificar')
  verify(@Param('id', ParseUUIDPipe) id: string, @Query('codigo') codigo?: string) {
    return this.shares.verifyReceipt(id, codigo ?? '');
  }
}
