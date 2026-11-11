import { Body, Controller, Get, Headers, HttpCode, Param, ParseUUIDPipe, Post, Put, Query, UnauthorizedException, UseGuards } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { timingSafeEqual } from 'node:crypto';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { SuperAdminGuard } from '../auth/superadmin.guard';
import { AddressDto, CancelNoteDto, EmitNoteDto, ManualNoteDto, NoteModeDto, NoteQueryDto } from './nfse.dto';
import { NfseService } from './nfse.service';

/** Nota fiscal de serviço (Cora): painel do administrador. */
@Controller('admin')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class NfseAdminController {
  constructor(private readonly nfse: NfseService) {}

  @Get('nfse/configuracao')
  settings() { return this.nfse.settings(); }

  @Put('nfse/modo') @UseGuards(SuperAdminGuard)
  setMode(@Body() dto: NoteModeDto, @CurrentUser() admin: AuthUser) { return this.nfse.setMode(dto.modo, admin); }

  @Post('notas-fiscais/emitir-pendentes')
  emitPending(@CurrentUser() admin: AuthUser) { return this.nfse.emitPending(admin); }

  @Get('nfse/diagnostico') @UseGuards(SuperAdminGuard)
  diagnostics() { return this.nfse.diagnostics(); }

  @Post('nfse/emissor') @UseGuards(SuperAdminGuard)
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
  async save(@Body() dto: AddressDto, @CurrentUser() user: AuthUser) {
    const saved = await this.nfse.saveAddress(user.id, dto);
    void this.nfse.retryAfterAddress(user.id);
    return saved;
  }
}

/**
 * Endereço que a Focus NFe chama quando uma nota muda de situação.
 * Se NFSE_FOCUS_WEBHOOK_SECRET estiver definido, a Focus precisa mandar o cabeçalho X-Focus-Segredo com o mesmo valor.
 * Mesmo sem segredo é seguro: a nota é sempre reconsultada na Focus.
 */
@Controller('webhooks')
export class NfseWebhookController {
  constructor(private readonly nfse: NfseService, private readonly config: ConfigService) {}

  @Post('focus-nfe') @HttpCode(200)
  focus(@Body() body: unknown, @Headers('x-focus-segredo') secret?: string) {
    const expected = (this.config.get<string>('NFSE_FOCUS_WEBHOOK_SECRET', '') ?? '').trim();
    if (expected) {
      const given = Buffer.from((secret ?? '').trim());
      const wanted = Buffer.from(expected);
      if (given.length !== wanted.length || !timingSafeEqual(given, wanted)) throw new UnauthorizedException('Segredo do webhook inválido.');
    }
    return this.nfse.handleFocusWebhook(body);
  }
}
