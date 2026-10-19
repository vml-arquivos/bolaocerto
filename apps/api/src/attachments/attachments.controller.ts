import { Body, Controller, Delete, Get, Header, Param, ParseUUIDPipe, Patch, Post, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { UpdateAttachmentDto, UploadAttachmentDto } from './attachments.dto';
import { AttachmentsService, UploadedFileLike } from './attachments.service';

/** Limite duro do multer; o limite configurável (UPLOAD_MAX_MB, padrão 10) é conferido no serviço. */
const HARD_LIMIT = 50 * 1024 * 1024;

/** Área da equipe: enviar, listar, ocultar e remover arquivos de um bolão. */
@Controller('operacao')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'operacao')
export class AttachmentsStaffController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Post('boloes/:id/anexos')
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: HARD_LIMIT, files: 1 } }))
  upload(@Param('id', ParseUUIDPipe) id: string, @UploadedFile() file: UploadedFileLike | undefined, @Body() dto: UploadAttachmentDto, @CurrentUser() user: AuthUser) {
    return this.attachments.upload(id, file, dto, user);
  }

  @Get('boloes/:id/anexos')
  list(@Param('id', ParseUUIDPipe) id: string) {
    return this.attachments.listForPool(id);
  }

  @Get('boloes/:id/cotas')
  shares(@Param('id', ParseUUIDPipe) id: string) {
    return this.attachments.listShares(id);
  }

  @Patch('anexos/:id')
  update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateAttachmentDto, @CurrentUser() user: AuthUser) {
    return this.attachments.update(id, dto, user);
  }

  /** Só administrador remove (a equipe de operação envia, mas não apaga). */
  @Delete('anexos/:id')
  @Roles('admin')
  remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) {
    return this.attachments.remove(id, user);
  }
}

/** Qualquer pessoa logada: abre só o que lhe pertence. */
@Controller('anexos')
@UseGuards(JwtAuthGuard)
export class AttachmentsDownloadController {
  constructor(private readonly attachments: AttachmentsService) {}

  @Get('meus')
  mine(@CurrentUser() user: AuthUser) {
    return this.attachments.listMine(user);
  }

  @Get(':id/arquivo')
  @Header('X-Content-Type-Options', 'nosniff')
  @Header('Cache-Control', 'private, no-store')
  async file(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Res({ passthrough: true }) response: Response) {
    const file = await this.attachments.openFor(id, user);
    response.setHeader('Content-Type', file.mime);
    response.setHeader('Content-Length', String(file.tamanho));
    // eslint-disable-next-line no-control-regex
    const ascii = file.nome.replace(/[^\x20-\x7e]/g, '_').replace(/["\\]/g, '_');
    response.setHeader('Content-Disposition', `inline; filename="${ascii}"; filename*=UTF-8''${encodeURIComponent(file.nome)}`);
    response.setHeader('X-File-Sha256', file.sha256);
    return new StreamableFile(file.stream);
  }
}
