import { Body, Controller, Get, Header, Put, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.utils';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { SaveHomeDto } from './home.dto';
import { HomeService } from './home.service';

@Controller()
export class HomeController {
  constructor(private readonly home: HomeService) {}

  @Get('home/config') @Header('Cache-Control', 'public, max-age=30')
  config() { return this.home.getConfig(); }

  @Get('resultados/ultimos') @Header('Cache-Control', 'public, max-age=60')
  latest(@Query('porModalidade') porModalidade?: string) { return this.home.latestResults(Number(porModalidade) || 5); }

  @Get('admin/home') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin') @Header('Cache-Control', 'private, no-store')
  adminView() { return this.home.getForAdmin(); }

  @Put('admin/home') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  save(@Body() dto: SaveHomeDto, @CurrentUser() user: AuthUser) { return this.home.save(dto, user.id); }
}
