import { Body, Controller, Get, HttpCode, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { DisableTwoFactorDto, LoginDto, RegisterDto, TwoFactorCodeDto } from './auth.dto';
import { clearAuthCookies, setAuthCookies } from './cookies';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './auth.decorators';
import { AuthUser } from './auth.utils';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('registrar')
  async register(@Body() dto: RegisterDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.register(dto);
    setAuthCookies(response, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(dto);
    setAuthCookies(response, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Post('refresh')
  async refresh(@Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const token = request.cookies?.refresh_token;
    const result = await this.auth.refresh(token);
    setAuthCookies(response, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  me(@CurrentUser() user: AuthUser) {
    return this.auth.profile(user.id);
  }

  @Post('logout')
  logout(@Res({ passthrough: true }) response: Response) {
    clearAuthCookies(response);
    return { ok: true };
  }

  /** Encerra TODAS as sessões desta conta (todos os aparelhos). */
  @Post('logout-todos')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async logoutAll(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) response: Response) {
    await this.auth.revokeAllSessions(user.id);
    clearAuthCookies(response);
    return { ok: true };
  }

  @Post('2fa/iniciar')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  startTwoFactor(@CurrentUser() user: AuthUser) { return this.auth.startTwoFactor(user.id); }

  @Post('2fa/ativar')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  enableTwoFactor(@CurrentUser() user: AuthUser, @Body() dto: TwoFactorCodeDto) { return this.auth.enableTwoFactor(user.id, dto.codigo); }

  @Post('2fa/desativar')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  disableTwoFactor(@CurrentUser() user: AuthUser, @Body() dto: DisableTwoFactorDto) { return this.auth.disableTwoFactor(user.id, dto.senha, dto.codigo); }
}
