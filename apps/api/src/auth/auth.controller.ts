import { Body, Controller, Get, HttpCode, Param, Post, Req, Res, UseGuards } from '@nestjs/common';
import { Request, Response } from 'express';
import { AuthService } from './auth.service';
import { DisableTwoFactorDto, GoogleCredentialDto, GoogleSignupDto, LoginDto, RegisterDto, TwoFactorCodeDto } from './auth.dto';
import { clearAuthCookies, setAuthCookies } from './cookies';
import { JwtAuthGuard } from './jwt-auth.guard';
import { CurrentUser } from './auth.decorators';
import { AuthUser } from './auth.utils';

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService) {}

  @Post('registrar')
  async register(@Body() dto: RegisterDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.register(dto, { ip: request.ip ?? request.socket.remoteAddress ?? 'unknown', userAgent: request.get('user-agent') });
    setAuthCookies(response, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  /** Tela de cadastro por link: mostra quem convidou e se o convite ainda vale (público, sem dados sensíveis). */
  @Get('convite/:codigo')
  inviteInfo(@Param('codigo') codigo: string) {
    return this.auth.inviteInfo(codigo);
  }

  @Post('login')
  async login(@Body() dto: LoginDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.login(dto);
    setAuthCookies(response, result.accessToken, result.refreshToken);
    return { user: result.user };
  }

  /** Informa à tela se o "Entrar com Google" está ativo (o client id do Google é público). */
  @Get('google/config')
  googleConfig() {
    const clientId = this.auth.googleClientId();
    return { ativo: Boolean(clientId), clientId };
  }

  @Post('google')
  @HttpCode(200)
  async google(@Body() dto: GoogleCredentialDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.googleLogin(dto.credential, { ip: request.ip ?? request.socket.remoteAddress ?? 'unknown', userAgent: request.get('user-agent') });
    if (result.tokens) {
      setAuthCookies(response, result.tokens.accessToken, result.tokens.refreshToken);
      return { user: result.tokens.user };
    }
    return { cadastroPendente: true, ...result.cadastro };
  }

  @Post('google/cadastro')
  async googleSignup(@Body() dto: GoogleSignupDto, @Req() request: Request, @Res({ passthrough: true }) response: Response) {
    const result = await this.auth.googleSignup(dto, { ip: request.ip ?? request.socket.remoteAddress ?? 'unknown', userAgent: request.get('user-agent') });
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
  async me(@CurrentUser() user: AuthUser) {
    return { ...(await this.auth.profile(user.id)), sessaoOciosaMin: this.auth.idleMinutes(user.papel) };
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
