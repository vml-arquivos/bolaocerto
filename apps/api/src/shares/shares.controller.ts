import { Body, Controller, Get, Headers, Param, Post, Query, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
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

  @Get('cotas/:id/premio')
  prize(@Param('id') id: string, @CurrentUser() user: AuthUser) {
    return this.shares.getPrize(id, user);
  }
}
