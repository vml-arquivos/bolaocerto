import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength, MinLength } from 'class-validator';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.utils';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AudienceKind, CommunicationsService } from './communications.service';
import { PushService } from './push.service';

class AudienceDto {
  @IsEnum(['todos', 'cotistas', 'afiliados', 'bolao', 'grupo', 'com_aviso_no_celular']) publico!: AudienceKind;
  @IsOptional() @IsUUID() bolaoId?: string;
  @IsOptional() @IsUUID() grupoId?: string;
}
class SendCommunicationDto extends AudienceDto {
  @IsString() @MinLength(3) @MaxLength(120) titulo!: string;
  @IsString() @MinLength(3) @MaxLength(600) mensagem!: string;
  @IsOptional() @IsString() @MaxLength(200) link?: string;
  @IsOptional() @IsBoolean() enviarEmail?: boolean;
}

/** Só o administrador manda mensagens para os clientes. */
@Controller('admin/comunicados')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class CommunicationsController {
  constructor(private readonly communications: CommunicationsService, private readonly push: PushService) {}

  @Get()
  async list() { return { comunicados: await this.communications.list(), aparelhos: await this.push.stats() }; }

  @Post('previa')
  preview(@Body() dto: AudienceDto) { return this.communications.preview(dto); }

  @Post()
  send(@Body() dto: SendCommunicationDto, @CurrentUser() user: AuthUser) { return this.communications.send(dto, user); }
}
