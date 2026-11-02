import { Body, Controller, Get, Param, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.utils';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CreateFestaContestDto, CreateManualContestDto, UpdateFestaContestDto } from './lotteries.dto';
import { LotteriesService } from './lotteries.service';

@Controller()
export class LotteriesController {
  constructor(private readonly lotteries: LotteriesService) {}

  @Get('concursos')
  list(@Query('modalidade') modalidade?: string, @Query('status') status?: string) {
    return this.lotteries.list(modalidade, status);
  }

  @Get('concursos/:id')
  getById(@Param('id') id: string) {
    return this.lotteries.getById(id);
  }

  @Get('concursos/:id/resultado')
  getResult(@Param('id') id: string) {
    return this.lotteries.getResult(id);
  }

  @Post('admin/concursos/sincronizar')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  sync(@Query('modalidade') modalidade?: string, @CurrentUser() _user?: unknown) {
    return this.lotteries.sync(modalidade);
  }

  @Get('admin/concursos/diagnostico')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  diagnostics() {
    return this.lotteries.diagnostics();
  }

  @Post('admin/concursos')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  createManual(@Body() dto: CreateManualContestDto) {
    return this.lotteries.createManual(dto);
  }

  @Get('admin/concursos/festas')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  festivals() {
    return this.lotteries.festivalPresets();
  }

  /** Cria concurso de festa (com ou sem número oficial) para já poder vender cotas. */
  @Post('admin/concursos/festa')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  createFestival(@Body() dto: CreateFestaContestDto, @CurrentUser() user: AuthUser) {
    return this.lotteries.createFestival(dto, user.id);
  }

  /** Informa o número oficial (ou o prêmio estimado) de um concurso de festa. */
  @Patch('admin/concursos/:id/festa')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  updateFestival(@Param('id') id: string, @Body() dto: UpdateFestaContestDto, @CurrentUser() user: AuthUser) {
    return this.lotteries.updateFestival(id, dto, user.id);
  }
}
