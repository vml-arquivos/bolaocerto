import { Body, Controller, Get, Headers, Post, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsString, IsUrl, MaxLength, ValidateNested } from 'class-validator';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.utils';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PushService } from './push.service';

class PushKeysDto {
  @IsString() @MaxLength(200) p256dh!: string;
  @IsString() @MaxLength(100) auth!: string;
}
class PushSubscribeDto {
  @IsUrl({ protocols: ['https'], require_protocol: true }) @MaxLength(1000) endpoint!: string;
  @ValidateNested() @Type(() => PushKeysDto) keys!: PushKeysDto;
}
class PushUnsubscribeDto {
  @IsString() @MaxLength(1000) endpoint!: string;
}

/** Cada pessoa liga e desliga os avisos do próprio aparelho. */
@Controller('push')
@UseGuards(JwtAuthGuard)
export class PushController {
  constructor(private readonly push: PushService) {}

  @Get('chave')
  async key() { return { chave: await this.push.publicKey() }; }

  @Get('status')
  status(@CurrentUser() user: AuthUser) { return this.push.status(user.id); }

  @Post('teste')
  test(@CurrentUser() user: AuthUser) { return this.push.sendTest(user.id); }

  @Post('inscrever')
  subscribe(@CurrentUser() user: AuthUser, @Body() dto: PushSubscribeDto, @Headers('user-agent') agent?: string) { return this.push.subscribe(user.id, dto, agent); }

  @Post('cancelar')
  unsubscribe(@CurrentUser() user: AuthUser, @Body() dto: PushUnsubscribeDto) { return this.push.unsubscribe(user.id, dto.endpoint); }
}
