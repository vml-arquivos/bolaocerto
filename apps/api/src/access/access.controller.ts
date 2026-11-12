import { Body, Controller, Get, Param, ParseUUIDPipe, Put, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsOptional, IsString, MaxLength } from 'class-validator';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.utils';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { SuperAdminGuard } from '../auth/superadmin.guard';
import { AccessService } from './access.service';

export class SaveAccessDto {
  /** Funções liberadas. Ausente ou null = voltar ao padrão do perfil. */
  @IsOptional() @IsArray() @ArrayMaxSize(60) @IsString({ each: true }) @MaxLength(40, { each: true }) modulos?: string[] | null;
}

/** Só a conta principal: escolhe o que cada pessoa da equipe usa no painel. */
@Controller('admin/acessos')
@UseGuards(JwtAuthGuard, RolesGuard, SuperAdminGuard)
@Roles('admin')
export class AccessController {
  constructor(private readonly access: AccessService) {}
  @Get('funcoes') catalog() { return { funcoes: this.access.catalog() }; }
  @Get(':id') detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.access.describe(id, user); }
  @Put(':id') save(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveAccessDto, @CurrentUser() user: AuthUser) { return this.access.save(id, dto.modulos ?? null, user); }
}
