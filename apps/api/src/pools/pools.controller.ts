import { Body, Controller, Delete, Get, Param, Patch, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CreatePoolDto, UpdatePoolDto } from './pools.dto';
import { PoolsService } from './pools.service';

@Controller()
export class PoolsController {
  constructor(private readonly pools: PoolsService) {}

  @Get('boloes')
  list() {
    return this.pools.listPublic();
  }

  @Get('grupos/:slug')
  group(@Param('slug') slug: string) {
    return this.pools.getGroupBySlug(slug);
  }

  @Get('boloes/:id')
  get(@Param('id') id: string) {
    return this.pools.getPublicById(id);
  }

  @Post('admin/boloes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'afiliado')
  create(@Body() dto: CreatePoolDto, @CurrentUser() user: AuthUser) {
    return this.pools.create(dto, user);
  }

  @Patch('admin/boloes/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'afiliado')
  update(@Param('id') id: string, @Body() dto: UpdatePoolDto, @CurrentUser() user: AuthUser) {
    return this.pools.update(id, dto, user);
  }

  @Delete('admin/boloes/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.pools.cancel(id, user);
  }
}
