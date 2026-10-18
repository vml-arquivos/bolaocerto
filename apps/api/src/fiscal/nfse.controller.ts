import { Body, Controller, Get, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AddressDto, CancelNoteDto, EmitNoteDto, ManualNoteDto, NoteQueryDto } from './nfse.dto';
import { NfseService } from './nfse.service';

/** Nota fiscal de serviço (Cora): painel do administrador. */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class NfseAdminController {
  constructor(private readonly nfse: NfseService) {}

  @Get('nfse/configuracao')
  settings() { return this.nfse.settings(); }

  @Get('nfse/diagnostico')
  diagnostics() { return this.nfse.diagnostics(); }

  @Post('nfse/emissor')
  registerIssuer(@CurrentUser() admin: AuthUser) { return this.nfse.registerIssuer(admin); }

  @Post('nfse/sincronizar')
  async sync() {
    const sincronizacao = await this.nfse.syncPending();
    const emissao = await this.nfse.autoEmit();
    return { sincronizacao, emissao };
  }

  @Get('notas-fiscais')
  list(@Query() query: NoteQueryDto) { return this.nfse.list(query); }

  @Post('notas-fiscais/pagamento/:pagamentoId/emitir')
  emit(@Param('pagamentoId', ParseUUIDPipe) pagamentoId: string, @Body() dto: EmitNoteDto, @CurrentUser() admin: AuthUser) {
    return this.nfse.emitForPayment(pagamentoId, admin, dto.endereco);
  }

  @Post('notas-fiscais/pagamento/:pagamentoId/manual')
  manual(@Param('pagamentoId', ParseUUIDPipe) pagamentoId: string, @Body() dto: ManualNoteDto, @CurrentUser() admin: AuthUser) {
    return this.nfse.registerManual(pagamentoId, dto, admin);
  }

  @Post('notas-fiscais/:id/sincronizar')
  refresh(@Param('id', ParseUUIDPipe) id: string) { return this.nfse.refresh(id); }

  @Post('notas-fiscais/:id/cancelar')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelNoteDto, @CurrentUser() admin: AuthUser) {
    return this.nfse.cancel(id, dto, admin);
  }
}

/** Endereço do participante (necessário para a emissão da nota). */
@Controller('usuarios/me')
@UseGuards(JwtAuthGuard)
export class UserAddressController {
  constructor(private readonly nfse: NfseService) {}

  @Get('endereco')
  get(@CurrentUser() user: AuthUser) { return this.nfse.getAddress(user.id); }

  @Put('endereco')
  save(@Body() dto: AddressDto, @CurrentUser() user: AuthUser) { return this.nfse.saveAddress(user.id, dto); }
}
