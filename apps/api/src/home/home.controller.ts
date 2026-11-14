import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Put, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { MAX_IMAGE_BYTES } from './home.config';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.utils';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { SaveAffiliateLinksDto, SaveCommunityDto, SaveGroupWhatsappDto, SaveHomeDto } from './home.dto';
import { HomeService } from './home.service';

@Controller()
export class HomeController {
  constructor(private readonly home: HomeService) {}

  @Get('home/config') @Header('Cache-Control', 'public, max-age=30')
  config() { return this.home.getConfig(); }

  @Get('config/comunidade') @Header('Cache-Control', 'public, max-age=30')
  community() { return this.home.getCommunity(); }

  @Put('admin/comunidade') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  saveCommunity(@Body() dto: SaveCommunityDto, @CurrentUser() admin: AuthUser) { return this.home.saveCommunity(dto, admin.id); }

  /** Links do WhatsApp dos grupos da pessoa logada (aparecem junto da comunidade e do Instagram). */
  @Get('usuarios/me/comunidade') @UseGuards(JwtAuthGuard) @Header('Cache-Control', 'private, no-store')
  myCommunity(@CurrentUser() user: AuthUser) { return this.home.myGroupsWhatsapp(user.id); }

  /** Página do afiliado: links do grupo e da comunidade do WhatsApp e do Instagram dele. */
  @Get('afiliados/me/links') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('afiliado') @Header('Cache-Control', 'private, no-store')
  affiliateLinks(@CurrentUser() user: AuthUser) { return this.home.getAffiliateLinks(user.id); }

  @Put('afiliados/me/links') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('afiliado')
  saveAffiliateLinks(@Body() dto: SaveAffiliateLinksDto, @CurrentUser() user: AuthUser) { return this.home.saveAffiliateLinks(user.id, dto); }

  @Get('grupos/:id/whatsapp') @UseGuards(JwtAuthGuard) @Header('Cache-Control', 'private, no-store')
  groupWhatsapp(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.home.getGroupWhatsapp(id, user); }

  @Put('grupos/:id/whatsapp') @UseGuards(JwtAuthGuard)
  saveGroupWhatsapp(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveGroupWhatsappDto, @CurrentUser() user: AuthUser) { return this.home.saveGroupWhatsapp(id, dto.link, user); }

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
