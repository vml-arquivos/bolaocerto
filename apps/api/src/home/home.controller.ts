import { Body, Controller, Get, Header, Param, Post, Put, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { MAX_IMAGE_BYTES } from './home.config';
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

  @Post('admin/home/imagem') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_IMAGE_BYTES + 1, files: 1 } }))
  uploadImage(@UploadedFile() file?: { buffer: Buffer }) { return this.home.saveImage(file); }

  @Get('home/imagem/:key')
  async image(@Param('key') key: string, @Res({ passthrough: true }) res: Response) {
    const image = await this.home.readImage(key);
    res.set({ 'Content-Type': image.mime, 'Cache-Control': 'public, max-age=86400', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(image.data);
  }

  @Put('admin/home') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  save(@Body() dto: SaveHomeDto, @CurrentUser() user: AuthUser) { return this.home.save(dto, user.id); }
}
