import { Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
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
}
