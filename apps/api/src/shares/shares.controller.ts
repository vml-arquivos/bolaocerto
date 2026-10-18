import { Body, Controller, Get, Headers, Param, ParseUUIDPipe, Post, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ReserveShareDto } from './shares.dto';
import { SharesService } from './shares.service';

@Controller()
@UseGuards(JwtAuthGuard)
export class SharesController {
  constructor(private readonly shares: SharesService) {}

  @Post('cotas/reservar')
  reserve(@Body() dto: ReserveShareDto, @CurrentUser() user: AuthUser, @Req() request: Request) {
    const userAgent = request.headers['user-agent'];
    return this.shares.reserve(dto, user, { ip: request.ip ?? request.socket.remoteAddress ?? 'unknown', userAgent: typeof userAgent === 'string' ? userAgent : undefined });
  }

  @Get('cotas/minhas')
  mine(@CurrentUser() user: AuthUser, @Query('apenas_premiadas') onlyPrize?: string) {
    return this.shares.listMine(user, onlyPrize === 'true');
  }

  @Get('cotas/:id/comprovante')
  receipt(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.shares.getPrivate(id, user);
  }

  /** Recibo detalhado. ?formato=pdf baixa o PDF; sem parâmetro devolve os dados em JSON para a tela. */
  @Get('cotas/:id/recibo')
  async receiptDetail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Query('formato') formato: string | undefined, @Res({ passthrough: true }) response: Response) {
    if (formato !== 'pdf') return this.shares.getReceipt(id, user);
    const file = await this.shares.getReceiptPdf(id, user);
    response.setHeader('Content-Type', 'application/pdf');
    response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
    response.setHeader('Cache-Control', 'no-store');
    return new StreamableFile(file.buffer);
  }

  @Get('cotas/:id/premio')
  prize(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.shares.getPrize(id, user);
  }
}
