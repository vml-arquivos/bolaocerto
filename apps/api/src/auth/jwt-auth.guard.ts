import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { Request } from 'express';
import { PrismaService } from '../common/prisma.service';
import { AuthUser } from './auth.utils';
import { isSuperAdmin } from '../admin/superadmin';

/** Cookie do modo "ver como": a conta principal vê o painel como outra pessoa da equipe, só para olhar. */
export const VIEW_AS_COOKIE = 'bl_ver_como';
const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

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
      // Revoke every account immediately, including cotistas and affiliates.
      if (this.prisma) {
        const row = await this.prisma.usuario.findUnique({ where: { id: payload.id }, select: { tokenVersion: true, papel: true, desativadoEm: true } });
        if (!row || row.desativadoEm || row.tokenVersion !== (payload.tv ?? 0)) throw new UnauthorizedException('Sessão encerrada. Faça login novamente.');
        papel = row.papel;
      }
      request.user = { id: payload.id, email: payload.email, papel };
    } catch {
      throw new UnauthorizedException('Token de acesso inválido ou expirado.');
    }
    await this.applyViewAs(request);
    return true;
  }

  /** Modo "ver como": só vale para a conta principal, só para contas da equipe e nunca para alterar nada. */
  private async applyViewAs(request: Request & { user?: AuthUser }): Promise<void> {
    const raw = request.cookies?.[VIEW_AS_COOKIE];
    const real = request.user;
    if (typeof raw !== 'string' || !raw || !real || !this.prisma || !isSuperAdmin(real)) return;
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(raw) || raw === real.id) return;
    const target = await this.prisma.usuario.findUnique({ where: { id: raw }, select: { id: true, email: true, papel: true, desativadoEm: true } });
    if (!target || target.desativadoEm || (target.papel !== 'admin' && target.papel !== 'operacao') || isSuperAdmin(target)) return;
    if (!READ_METHODS.has(request.method.toUpperCase())) throw new ForbiddenException('Você está vendo o painel como outra pessoa (só para olhar). Saia desse modo para fazer alterações.');
    request.user = { id: target.id, email: target.email, papel: target.papel as AuthUser['papel'], verComoPor: real.id };
  }
}
