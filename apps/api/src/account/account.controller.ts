import { Body, Controller, Delete, Get, Header, HttpCode, Param, ParseUUIDPipe, Patch, Post, Put, Res, StreamableFile, UploadedFile, UseGuards, UseInterceptors } from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { Response } from 'express';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AuthService } from '../auth/auth.service';
import { setAuthCookies } from '../auth/cookies';
import { AccountService } from './account.service';
import { ResponsiblePlayService } from '../common/responsible-play.service';
import { ChangePasswordDto, DeletionRequestDto, ForgotPasswordDto, MonthlyLimitDto, PauseDto, ResetPasswordDto, UpdateProfileDto } from './account.dto';
import { MAX_PHOTO_BYTES } from './account.service';

@Controller()
export class AccountController {
  constructor(private readonly account: AccountService, private readonly auth: AuthService, private readonly responsible: ResponsiblePlayService) {}

  @Post('auth/esqueci-senha')
  @HttpCode(200)
  forgot(@Body() dto: ForgotPasswordDto) { return this.account.requestReset(dto.email); }

  @Post('auth/redefinir-senha')
  @HttpCode(200)
  reset(@Body() dto: ResetPasswordDto) { return this.account.resetPassword(dto.token, dto.novaSenha); }

  @Get('usuarios/me/perfil') @UseGuards(JwtAuthGuard)
  profile(@CurrentUser() user: AuthUser) { return this.account.getProfile(user.id); }

  @Patch('usuarios/me') @UseGuards(JwtAuthGuard)
  updateProfile(@Body() dto: UpdateProfileDto, @CurrentUser() user: AuthUser) { return this.account.updateProfile(user.id, dto); }

  @Put('usuarios/me/foto') @UseGuards(JwtAuthGuard)
  @UseInterceptors(FileInterceptor('arquivo', { limits: { fileSize: MAX_PHOTO_BYTES + 1, files: 1 } }))
  savePhoto(@UploadedFile() file: { buffer: Buffer } | undefined, @CurrentUser() user: AuthUser) { return this.account.savePhoto(user.id, file); }

  @Get('usuarios/me/foto') @UseGuards(JwtAuthGuard)
  async photo(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) res: Response) {
    const photo = await this.account.readPhoto(user.id);
    res.set({ 'Content-Type': photo.mime, 'Cache-Control': 'private, max-age=3600', 'X-Content-Type-Options': 'nosniff' });
    return new StreamableFile(photo.data);
  }

  @Delete('usuarios/me/foto') @UseGuards(JwtAuthGuard)
  deletePhoto(@CurrentUser() user: AuthUser) { return this.account.deletePhoto(user.id); }

  @Post('usuarios/me/senha')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  async change(@CurrentUser() user: AuthUser, @Body() dto: ChangePasswordDto, @Res({ passthrough: true }) response: Response) {
    const result = await this.account.changePassword(user.id, dto.senhaAtual, dto.novaSenha);
    // A troca encerra as OUTRAS sessões (tokenVersion); esta continua com tokens novos.
    const fresh = await this.auth.reissue(user.id);
    setAuthCookies(response, fresh.accessToken, fresh.refreshToken);
    return result;
  }

  @Get('usuarios/me/dados')
  @UseGuards(JwtAuthGuard)
  async exportData(@CurrentUser() user: AuthUser, @Res({ passthrough: true }) response: Response) {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('Content-Disposition', 'attachment; filename="meus-dados-bl.json"');
    return this.account.exportData(user.id);
  }

  @Post('usuarios/me/exclusao')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  requestDeletion(@CurrentUser() user: AuthUser, @Body() dto: DeletionRequestDto) { return this.account.requestDeletion(user.id, dto.motivo); }

  @Get('usuarios/me/jogo-responsavel')
  @UseGuards(JwtAuthGuard)
  responsibleStatus(@CurrentUser() user: AuthUser) { return this.responsible.status(user.id); }

  @Post('usuarios/me/jogo-responsavel/pausa')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard)
  pause(@CurrentUser() user: AuthUser, @Body() dto: PauseDto) { return this.responsible.pause(user.id, dto); }

  @Put('usuarios/me/jogo-responsavel/limite')
  @UseGuards(JwtAuthGuard)
  setLimit(@CurrentUser() user: AuthUser, @Body() dto: MonthlyLimitDto) { return this.responsible.setLimit(user.id, dto.valor); }

  @Post('admin/usuarios/:id/redefinicao-senha')
  @Header('Cache-Control', 'private, no-store')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  adminLink(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser) { return this.account.adminResetLink(id, admin.id); }

  @Post('admin/usuarios/:id/2fa/redefinir')
  @HttpCode(200)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  adminResetTwoFactor(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser) { return this.auth.adminResetTwoFactor(id, admin.id); }
}
