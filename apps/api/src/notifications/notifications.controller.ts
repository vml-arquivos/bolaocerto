import { Controller, Delete, Get, Param, ParseUUIDPipe, Post, Req, UseGuards } from '@nestjs/common';
import { Request } from 'express';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { NotificationsService } from './notifications.service';

@Controller()
export class NotificationsController {
  constructor(private readonly notifications: NotificationsService, private readonly jwt: JwtService, private readonly config: ConfigService) {}

  @Get('notificacoes')
  @UseGuards(JwtAuthGuard)
  list(@CurrentUser() user: AuthUser) { return this.notifications.list(user.id); }

  @Post('notificacoes/lidas')
  @UseGuards(JwtAuthGuard)
  markAll(@CurrentUser() user: AuthUser) { return this.notifications.markAllRead(user.id); }

  @Post('notificacoes/:id/lida')
  @UseGuards(JwtAuthGuard)
  markOne(@CurrentUser() user: AuthUser, @Param('id', ParseUUIDPipe) id: string) { return this.notifications.markRead(user.id, id); }

  /** Público: informa se o bolão é condicional, se já liberou e quantas pessoas pediram aviso; com login, se a própria pessoa já pediu. */
  @Get('boloes/:id/avise-me')
  async status(@Param('id', ParseUUIDPipe) id: string, @Req() request: Request) {
    return this.notifications.interestStatus(id, await this.optionalUserId(request));
  }

  @Post('boloes/:id/avise-me')
  @UseGuards(JwtAuthGuard)
  subscribe(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.notifications.subscribe(id, user.id); }

  @Delete('boloes/:id/avise-me')
  @UseGuards(JwtAuthGuard)
  unsubscribe(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.notifications.unsubscribe(id, user.id); }

  private async optionalUserId(request: Request): Promise<string | undefined> {
    const token = request.cookies?.access_token as string | undefined;
    if (!token) return undefined;
    try {
      const payload = await this.jwt.verifyAsync<{ id?: string; sub?: string; typ?: string }>(token, { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET') });
      return payload.typ === 'access' ? payload.id ?? payload.sub : undefined;
    } catch { return undefined; }
  }
}
