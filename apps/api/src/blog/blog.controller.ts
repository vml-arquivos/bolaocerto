import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Post, Put, Query, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import type { Response } from 'express';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.utils';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { SaveBlogPostDto, SaveSiteSeoDto } from './blog.dto';
import { BlogService, MAX_BLOG_IMAGE_BYTES } from './blog.service';

@Controller()
export class BlogController {
  constructor(private readonly blog: BlogService) {}

  @Get('blog/posts') @Header('Cache-Control', 'public, max-age=60')
  list(@Query('limite') limite?: string) { return this.blog.listPublished(Number(limite) || 50); }

  @Get('blog/posts/:slug') @Header('Cache-Control', 'public, max-age=60')
  get(@Param('slug') slug: string) { return this.blog.getPublished(slug); }

  @Get('blog/imagem/:key')
  async image(@Param('key') key: string, @Res({ passthrough: true }) res: Response) {
    const image = await this.blog.readImage(key);
    res.set({ 'Content-Type': image.mime, 'Cache-Control': 'public, max-age=604800', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(image.data);
  }

  @Get('seo/site') @Header('Cache-Control', 'public, max-age=60')
  seo() { return this.blog.getSeo(); }

  @Get('admin/blog/posts') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin') @Header('Cache-Control', 'private, no-store')
  adminList() { return this.blog.listForAdmin(); }

  @Post('admin/blog/posts') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  create(@Body() dto: SaveBlogPostDto, @CurrentUser() user: AuthUser) { return this.blog.save(dto, user as never); }

  @Put('admin/blog/posts/:id') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SaveBlogPostDto, @CurrentUser() user: AuthUser) { return this.blog.save(dto, user as never, id); }

  @Delete('admin/blog/posts/:id') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  remove(@Param('id', ParseUUIDPipe) id: string) { return this.blog.remove(id); }

  @Post('admin/blog/imagem') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_BLOG_IMAGE_BYTES + 1, files: 1 } }))
  upload(@UploadedFile() file?: { buffer: Buffer }) { return this.blog.saveImage(file); }

  @Put('admin/seo') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  saveSeo(@Body() dto: SaveSiteSeoDto) { return this.blog.saveSeo(dto); }
}
