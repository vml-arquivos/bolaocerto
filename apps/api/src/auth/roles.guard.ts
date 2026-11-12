import { CanActivate, ExecutionContext, ForbiddenException, Injectable, Optional } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { Request } from 'express';
import { ROLES_KEY } from './auth.decorators';
import { AuthUser } from './auth.utils';
import { AccessService } from '../access/access.service';
import { modulesForRoute } from '../access/access.catalog';
import { isSuperAdmin } from '../admin/superadmin';

export const BLOCKED_FUNCTION = 'Esta função não está liberada para o seu acesso. Fale com o administrador principal.';

/** Caminho da rota (com os :parâmetros), para saber de qual função do painel ela é. */
export function routePath(request: Request): string {
  return String((request as Request & { route?: { path?: string } }).route?.path ?? request.path ?? '');
}

@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, @Optional() private readonly access?: AccessService) {}

  async canActivate(context: ExecutionContext): Promise<boolean> {
    const required = this.reflector.getAllAndOverride<AuthUser['papel'][]>(ROLES_KEY, [context.getHandler(), context.getClass()]);
    if (!required?.length) return true;
    const request = context.switchToHttp().getRequest<Request & { user?: AuthUser }>();
    const user = request.user;
    if (!user) throw new ForbiddenException('Papel sem permissão para esta operação.');
    const roleOk = required.includes(user.papel);
    // Acesso por função: só pesa para a equipe (admin e operação) que a conta principal personalizou.
    // Sem personalização, vale só o perfil, exatamente como antes.
    const staff = user.papel === 'admin' || user.papel === 'operacao';
    if (this.access && staff && !isSuperAdmin(user)) {
      const modules = modulesForRoute(request.method, routePath(request));
      if (modules.length) {
        const custom = await this.access.customModules(user.id);
        if (custom !== null) {
          if (modules.some((key) => custom.includes(key))) return true; // liberado pela conta principal (vale também para a operação)
          throw new ForbiddenException(BLOCKED_FUNCTION);
        }
      }
    }
    if (!roleOk) throw new ForbiddenException('Papel sem permissão para esta operação.');
    return true;
  }
}
