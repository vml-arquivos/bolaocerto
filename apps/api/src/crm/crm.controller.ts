import { Body, Controller, Get, Param, ParseUUIDPipe, Patch, Post, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { CrmListQueryDto, CrmNoteDto, CrmProfileDto } from './crm.dto';
import { CrmService } from './crm.service';

@Controller('admin/crm')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class CrmController {
  constructor(private readonly crm: CrmService) {}

  @Get('resumo')
  overview() { return this.crm.overview(); }

  @Get('apostadores')
  async list(@Query() query: CrmListQueryDto, @CurrentUser() admin: AuthUser, @Res({ passthrough: true }) response: Response) {
    const result = await this.crm.list(query, admin);
    if (!('buffer' in result)) return result;
    response.setHeader('Content-Type', result.contentType);
    response.setHeader('Content-Disposition', `attachment; filename="${result.filename}"`);
    response.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(result.buffer);
  }

  @Get('apostadores/:id')
  detail(@Param('id', ParseUUIDPipe) id: string) { return this.crm.detail(id); }

  @Post('apostadores/:id/notas')
  note(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CrmNoteDto, @CurrentUser() admin: AuthUser) { return this.crm.addNote(id, dto, admin); }

  @Patch('apostadores/:id')
  profile(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CrmProfileDto, @CurrentUser() admin: AuthUser) { return this.crm.updateProfile(id, dto, admin); }
}
