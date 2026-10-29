import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Patch, Post, UseGuards } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.utils';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AdminUsersService, EditManagedUserDto } from './admin-users.service';
@Controller('admin/usuarios')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class AdminUsersController {
  constructor(private readonly users: AdminUsersService) {}
  @Get(':id') @Header('Cache-Control', 'private, no-store')
  detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) { return this.users.detail(id, actor); }
  @Patch(':id')
  edit(@Param('id', ParseUUIDPipe) id: string, @Body() dto: EditManagedUserDto, @CurrentUser() actor: AuthUser) { return this.users.edit(id, dto, actor); }
  @Delete(':id')
  removeAccess(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) { return this.users.setActive(id, false, actor); }
  @Post(':id/reativar')
  reactivate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) { return this.users.setActive(id, true, actor); }
  @Post(':id/reenviar-senha')
  sendReset(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() actor: AuthUser) { return this.users.sendReset(id, actor); }
}
