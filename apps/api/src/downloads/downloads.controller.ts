import { Controller, Get, Param, ParseUUIDPipe, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ReportQueryDto } from '../reports/reports.dto';
import { DownloadFile, DownloadsService } from './downloads.service';

function send(file: DownloadFile, response: Response): StreamableFile {
  response.setHeader('Content-Type', file.contentType);
  response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  response.setHeader('Cache-Control', 'no-store');
  return new StreamableFile(file.buffer);
}

/** Documentos para ver e baixar por período: recibos e notas fiscais (um a um ou todos num .zip). */
@Controller('admin/downloads')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class DownloadsController {
  constructor(private readonly downloads: DownloadsService) {}

  @Get('recibos')
  receipts(@Query() query: ReportQueryDto) { return this.downloads.listReceipts(query); }

  @Get('recibos/zip')
  async receiptsZip(@Query() query: ReportQueryDto, @CurrentUser() admin: AuthUser, @Res({ passthrough: true }) response: Response) {
    return send(await this.downloads.receiptsZip(query, admin), response);
  }

  @Get('notas')
  notes(@Query() query: ReportQueryDto) { return this.downloads.listNotes(query); }

  @Get('notas/:id/arquivo')
  async noteFile(@Param('id', ParseUUIDPipe) id: string, @Query('tipo') tipo: string, @CurrentUser() admin: AuthUser, @Res({ passthrough: true }) response: Response) {
    return send(await this.downloads.noteFile({ noteId: id }, tipo, admin), response);
  }

  @Get('notas/zip')
  async notesZip(@Query() query: ReportQueryDto, @Res({ passthrough: true }) response: Response) {
    return send(await this.downloads.notesZip(query), response);
  }
}

/** Nota fiscal da própria cota, para o participante ver, baixar ou imprimir na conta. */
@Controller('cotas')
@UseGuards(JwtAuthGuard)
export class MyNoteController {
  constructor(private readonly downloads: DownloadsService) {}

  @Get(':id/nota-fiscal')
  async file(@Param('id', ParseUUIDPipe) id: string, @Query('tipo') tipo: string, @CurrentUser() user: AuthUser, @Res({ passthrough: true }) response: Response) {
    return send(await this.downloads.noteFile({ cotaId: id }, tipo, user), response);
  }
}
