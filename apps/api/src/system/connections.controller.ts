import { Body, Controller, Get, Post, UseGuards } from '@nestjs/common';
import { IsEmail, IsOptional } from 'class-validator';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ConnectionsService } from './connections.service';

class TestEmailDto {
  @IsOptional() @IsEmail()
  para?: string;
}

/** Só administrador: estado das conexões (e-mail, pagamentos, CAIXA, arquivos, segurança) e testes. */
@Controller('admin/conexoes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ConnectionsController {
  constructor(private readonly connections: ConnectionsService) {}

  @Get()
  overview() {
    return this.connections.overview();
  }

  @Post('email/testar')
  testEmail(@Body() dto: TestEmailDto, @CurrentUser() user: AuthUser) {
    return this.connections.testEmail(dto.para ?? user.email, user);
  }

  @Post('alertas/testar')
  testAlert() {
    return this.connections.testAlert();
  }
}
