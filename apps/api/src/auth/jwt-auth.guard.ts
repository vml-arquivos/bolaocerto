import { CanActivate, ExecutionContext, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../common/prisma.service';
import { AuthUser } from './auth.utils';

@Injectable()
export class JwtAuthGuard implements CanActivate {
  constructor(private readonly jwt: JwtService, private readonly config: ConfigService, @Optional() private readonly prisma?: PrismaService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const header = request.headers.authorization;
    const token = header?.startsWith('Bearer ') ? header.slice(7) : request.cookies?.access_token;
    if (!token) throw new UnauthorizedException('Token de acesso ausente.');
    try {
      const payload = await this.jwt.verifyAsync<AuthUser & { typ?: string; tv?: number }>(token, { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET') });
      if (payload.typ !== 'access') throw new UnauthorizedException('Token de acesso inválido.');
      let papel = payload.papel;
      // Contas com poder administrativo são conferidas no banco a cada chamada: sessão revogada, 2FA redefinido ou
      // papel alterado valem na hora, sem esperar o token de 15 minutos expirar. (Cotistas seguem 100% stateless.)
      if (this.prisma && (papel === 'admin' || papel === 'operacao')) {
        const row = await this.prisma.usuario.findUnique({ where: { id: payload.id }, select: { tokenVersion: true, papel: true } });
        if (!row || row.tokenVersion !== (payload.tv ?? 0)) throw new UnauthorizedException('Sessão encerrada. Entre novamente.');
        papel = row.papel;
      }
      request.user = { id: payload.id, email: payload.email, papel };
      return true;
    } catch {
      throw new UnauthorizedException('Token de acesso inválido ou expirado.');
    }
  }
}
