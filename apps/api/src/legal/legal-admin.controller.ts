import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { Equals, IsOptional, IsString, MaxLength } from 'class-validator';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { assertKind, LegalPublishingService } from './legal-publishing.service';

export class PublishDocumentDto {
  @IsString() @MaxLength(200_000) texto!: string;
  @IsOptional() @IsString() @MaxLength(40) versao?: string;
  @Equals(true, { message: 'Confirme que revisou o texto antes de publicar.' }) confirmo!: boolean;
}

/** Documentos do sistema (termos, privacidade e contratos): ver o texto vigente, publicar versão nova, voltar ao padrão. */
@Controller('admin/documentos')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class LegalAdminController {
  constructor(private readonly publishing: LegalPublishingService) {}
  @Get() overview() { return this.publishing.overview(); }
  @Get(':tipo') detail(@Param('tipo') tipo: string) { return this.publishing.detail(assertKind(tipo)); }
  @Post(':tipo/publicar') publish(@Param('tipo') tipo: string, @Body() dto: PublishDocumentDto, @CurrentUser() user: AuthUser) { return this.publishing.publish(assertKind(tipo), { texto: dto.texto, versao: dto.versao }, user); }
  @Post(':tipo/voltar-ao-padrao') revert(@Param('tipo') tipo: string, @CurrentUser() user: AuthUser) { return this.publishing.revert(assertKind(tipo), user); }
}
