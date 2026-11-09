import { PricingService } from '../pricing/pricing.service';
import { Body, Controller, Delete, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsString, IsUUID, Length } from 'class-validator';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CreatePoolDto, DefinePoolNumbersDto, GenerateGamesDto, UpdatePoolDto } from './pools.dto';
import { PoolsService } from './pools.service';

class MoveContestDto {
  @IsUUID()
  concursoId!: string;
}

class RejectPoolDto {
  @IsString() @Length(3, 300)
  motivo!: string;
}

@Controller()
export class PoolsController {
  constructor(private readonly pools: PoolsService, private readonly pricing: PricingService) {}

  @Get('loterias/precos')
  prices() { return this.pricing.catalog(); }

  @Post('admin/boloes/cotacao')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'afiliado')
  async quote(@Body() dto: CreatePoolDto) { return this.pools.quote(dto); }

  /** Gera de 1 a 100 jogos e calcula o custo do registro na CAIXA. */
  @Post('admin/boloes/gerar-jogos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin', 'afiliado')
  generateGames(@Body() dto: GenerateGamesDto) { return this.pools.generateGames(dto); }

  @Get('boloes')
  list() {
    return this.pools.listPublic();
  }

  @Get('grupos/:slug')
  group(@Param('slug') slug: string) {
    return this.pools.getGroupBySlug(slug);
  }

  @Get('grupos/:slug/minha-participacao')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('cotista', 'afiliado', 'admin', 'operacao')
  groupMembership(@Param('slug') slug: string, @CurrentUser() user: AuthUser) { return this.pools.groupMembership(slug, user.id); }

  @Post('grupos/:slug/entrar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('cotista', 'afiliado', 'admin', 'operacao')
  joinGroup(@Param('slug') slug: string, @CurrentUser() user: AuthUser) { return this.pools.joinGroup(slug, user); }

  @Delete('grupos/:slug/sair')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('cotista', 'afiliado', 'admin', 'operacao')
  leaveGroup(@Param('slug') slug: string, @CurrentUser() user: AuthUser) { return this.pools.leaveGroup(slug, user); }

  /** Admin devolve ao afiliado um bolão que pediu aprovação, com o motivo. */
  @Post('admin/boloes/:id/recusar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  rejectApproval(@Param('id') id: string, @Body() dto: RejectPoolDto, @CurrentUser() user: AuthUser) { return this.pools.rejectApproval(id, dto.motivo.trim(), user); }

  @Get('boloes/disponiveis')
  available() { return this.pools.listAvailable(); }

  @Get('boloes/sorteados')
  drawn() { return this.pools.listDrawn(); }

  @Get('boloes/historico')
  history() { return this.pools.listHistory(); }

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

  @Post('admin/boloes/:id/liberar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  release(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.pools.release(id, user);
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

  @Delete('admin/boloes/:id/sem-movimentacao')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  removeUnused(@Param('id') id: string, @Query('forcar') force: string | undefined, @CurrentUser() user: AuthUser) {
    return this.pools.removeUnused(id, user, force === 'true' || force === '1');
  }

  @Post('afiliados/me/boloes/:id/numeros')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('afiliado')
  defineAffiliateNumbers(@Param('id') id: string, @Body() dto: DefinePoolNumbersDto, @CurrentUser() user: AuthUser) {
    return this.pools.defineNumbers(id, dto, user);
  }

  @Post('admin/boloes/:id/numeros')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  defineNumbers(@Param('id') id: string, @Body() dto: DefinePoolNumbersDto, @CurrentUser() user: AuthUser) {
    return this.pools.defineNumbers(id, dto, user);
  }

  @Post('admin/boloes/:id/trocar-concurso')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  moveToContest(@Param('id') id: string, @Body() dto: MoveContestDto, @CurrentUser() user: AuthUser) {
    return this.pools.moveToContest(id, dto.concursoId, user);
  }

  @Get('admin/boloes/:id/exclusao')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  previewRemoval(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.pools.previewRemoval(id, user);
  }

  @Delete('admin/boloes/:id')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  cancel(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.pools.cancel(id, user);
  }
}
