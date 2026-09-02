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

  @Post('afiliados/me/boloes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('afiliado')
  createAffiliatePool(@Body() dto: CreatePoolDto, @CurrentUser() user: AuthUser) {
    return this.pools.create(dto, user);
  }

  @Post('admin/boloes')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  create(@Body() dto: CreatePoolDto, @CurrentUser() user: AuthUser) {
    return this.pools.create(dto, user);
  }

  @Patch('afiliados/me/boloes/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('afiliado')
  updateAffiliatePool(@Param('id') id: string, @Body() dto: UpdatePoolDto, @CurrentUser() user: AuthUser) {
    return this.pools.update(id, dto, user);
  }

  @Patch('admin/boloes/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  update(@Param('id') id: string, @Body() dto: UpdatePoolDto, @CurrentUser() user: AuthUser) {
    return this.pools.update(id, dto, user);
  }

  @Post('afiliados/me/boloes/:id/publicar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('afiliado')
  publishAffiliatePool(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.pools.publish(id, user);
  }

  @Post('admin/boloes/:id/publicar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  publish(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.pools.publish(id, user);
  }

  @Post('afiliados/me/boloes/:id/fechar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('afiliado')
  closeAffiliatePool(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.pools.close(id, user);
  }

  @Post('admin/boloes/:id/fechar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  close(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.pools.close(id, user);
  }

  @Post('afiliados/me/boloes/:id/duplicar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('afiliado')
  duplicateAffiliatePool(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.pools.duplicate(id, user);
  }

  @Post('admin/boloes/:id/duplicar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  duplicate(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.pools.duplicate(id, user);
  }

  @Delete('afiliados/me/boloes/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('afiliado')
  cancelAffiliatePool(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.pools.cancel(id, user);
  }

  @Delete('admin/boloes/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.pools.cancel(id, user);
  }
}
