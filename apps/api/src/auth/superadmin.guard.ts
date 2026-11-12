import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Request } from 'express';
import { isSuperAdmin } from '../admin/superadmin';
import { AuthUser } from './auth.utils';
import { AccessService } from '../access/access.service';
import { modulesForRoute, SUPER_MODULES } from '../access/access.catalog';
import { routePath } from './roles.guard';

/**
 * Só a conta principal do sistema (ADMIN_BOOTSTRAP_EMAIL) passa. Usar depois do JwtAuthGuard:
 *   @UseGuards(JwtAuthGuard, RolesGuard, SuperAdminGuard)
 * Sem a variável configurada ninguém passa (falha fechada).
 * Exceção: Documentos, Integrações, Histórico e Configurações, quando a conta principal liberou a função para a pessoa.
 */
@Injectable()
export class SuperAdminGuard implements CanActivate {
  constructor(@Optional() private readonly access?: AccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = request.user;
    if (user && isSuperAdmin(user)) return true;
    if (user && this.access && (user.papel === 'admin' || user.papel === 'operacao')) {
      const modules = modulesForRoute(request.method, routePath(request)).filter((key) => SUPER_MODULES.includes(key));
      if (modules.length) {
        const custom = await this.access.customModules(user.id);
        if (custom && modules.some((key) => custom.includes(key))) return true;
      }
    }
    throw new ForbiddenException('Esta área é restrita à conta principal do sistema.');
  }
}
