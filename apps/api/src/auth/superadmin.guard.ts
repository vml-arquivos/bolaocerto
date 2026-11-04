import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Request } from 'express';
import { isSuperAdmin } from '../admin/superadmin';
import { AuthUser } from './auth.utils';

/**
 * Só a conta principal do sistema (ADMIN_BOOTSTRAP_EMAIL) passa. Usar depois do JwtAuthGuard:
 *   @UseGuards(JwtAuthGuard, RolesGuard, SuperAdminGuard)
 * Sem a variável configurada ninguém passa (falha fechada).
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  canActivate(context: ExecutionContext): boolean {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    if (!request.user || !isSuperAdmin(request.user)) throw new ForbiddenException('Esta área é restrita à conta principal do sistema.');
    return true;
  }
}
