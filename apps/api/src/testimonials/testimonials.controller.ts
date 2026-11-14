import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Patch, Post, Query, UseGuards } from '@nestjs/common';
import { IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min } from 'class-validator';
import { Type } from 'class-transformer';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.utils';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { TestimonialsService } from './testimonials.service';

class SaveTestimonialDto {
  @IsOptional() @IsString() @MaxLength(60) nome?: string;
  @IsString() @MaxLength(800) texto!: string;
  @Type(() => Number) @IsInt() @Min(1) @Max(5) estrelas!: number;
  @IsOptional() @IsUUID() afiliadoId?: string | null;
}
class ModerateTestimonialDto { @IsIn(['aprovado', 'oculto']) status!: 'aprovado' | 'oculto'; }

@Controller()
export class TestimonialsController {
  constructor(private readonly testimonials: TestimonialsService) {}

  @Get('depoimentos') @Header('Cache-Control', 'public, max-age=60')
  list(@Query('limite') limit?: string, @Query('afiliado') affiliate?: string) { return this.testimonials.publicList(Number(limit) || 12, affiliate?.slice(0, 40)); }

  @Get('depoimentos/meus') @UseGuards(JwtAuthGuard) @Header('Cache-Control', 'private, no-store')
  mine(@CurrentUser() user: AuthUser) { return this.testimonials.mine(user); }

  @Post('depoimentos') @UseGuards(JwtAuthGuard)
  save(@Body() dto: SaveTestimonialDto, @CurrentUser() user: AuthUser) { return this.testimonials.save(user, dto); }

  @Delete('depoimentos/:id') @UseGuards(JwtAuthGuard)
  removeMine(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.testimonials.removeMine(user, id); }

  @Get('afiliados/me/depoimentos') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('afiliado') @Header('Cache-Control', 'private, no-store')
  forAffiliate(@CurrentUser() user: AuthUser) { return this.testimonials.forAffiliate(user); }

  @Get('admin/depoimentos') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin') @Header('Cache-Control', 'private, no-store')
  adminList(@Query('status') status?: string) { return this.testimonials.adminList(status); }

  @Patch('admin/depoimentos/:id') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  moderate(@Param('id', ParseUUIDPipe) id: string, @Body() dto: ModerateTestimonialDto, @CurrentUser() user: AuthUser) { return this.testimonials.moderate(id, dto.status, user); }

  @Delete('admin/depoimentos/:id') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.testimonials.adminRemove(id, user); }
}
