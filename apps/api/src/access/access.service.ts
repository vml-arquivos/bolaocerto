import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { isSuperAdmin } from '../admin/superadmin';
import { AuthUser } from '../auth/auth.utils';
import { ACCESS_KEYS, ACCESS_MODULES, defaultModules } from './access.catalog';

const KEY = (userId: string) => `acesso.usuario.${userId}`;
const TTL_MS = 30_000;
const cache = new Map<string, { at: number; modules: string[] | null }>();

/** Esquece o acesso guardado em memória (depois de salvar ou de trocar o perfil da pessoa). */
export function forgetAccess(userId: string): void { cache.delete(userId); }

/**
 * Acesso por função: a conta principal escolhe, pessoa a pessoa da equipe, o que cada uma usa no painel.
 * Sem escolha salva, vale o padrão do perfil (exatamente como antes).
 */
@Injectable()
export class AccessService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Lista personalizada da pessoa, ou null quando segue o padrão do perfil. */
  async customModules(userId: string): Promise<string[] | null> {
    const hit = cache.get(userId);
    if (hit && Date.now() - hit.at < TTL_MS) return hit.modules;
    const row = await this.prisma.configuracaoSistema.findUnique({ where: { chave: KEY(userId) } });
    let modules: string[] | null = null;
    if (row) { try { const parsed = JSON.parse(row.valor); if (Array.isArray(parsed?.modulos)) modules = parsed.modulos.filter((key: unknown) => typeof key === 'string' && ACCESS_KEYS.includes(key)); } catch { modules = null; } }
    cache.set(userId, { at: Date.now(), modules });
    return modules;
  }

  /** O que a pessoa pode usar agora. A conta principal sempre tem tudo. */
  async effectiveModules(user: Pick<AuthUser, 'id' | 'email' | 'papel'>): Promise<string[]> {
    if (isSuperAdmin(user)) return [...ACCESS_KEYS];
    if (user.papel !== 'admin' && user.papel !== 'operacao') return [];
    return (await this.customModules(user.id)) ?? defaultModules(user.papel);
  }

  catalog() { return ACCESS_MODULES; }

  private async staffTarget(id: string, actor: AuthUser) {
    if (!isSuperAdmin(actor)) throw new ForbiddenException('Só a conta principal libera ou bloqueia funções.');
    const target = await this.prisma.usuario.findUnique({ where: { id }, select: { id: true, nome: true, email: true, papel: true } });
    if (!target) throw new NotFoundException('Usuário não encontrado.');
    if (target.id === actor.id || isSuperAdmin(target)) throw new BadRequestException('A conta principal sempre tem acesso a tudo.');
    if (target.papel !== 'admin' && target.papel !== 'operacao') throw new BadRequestException('O acesso por função vale para administradores e equipe de operação. Cliente e afiliado usam as próprias áreas.');
    return target;
  }

  async describe(id: string, actor: AuthUser) {
    const target = await this.staffTarget(id, actor);
    const custom = await this.customModules(id);
    const padrao = defaultModules(target.papel);
    return { usuarioId: id, papel: target.papel, personalizado: custom !== null, modulos: custom ?? padrao, padrao, catalogo: ACCESS_MODULES };
  }

  /** Salva a lista (ou volta ao padrão com `null`). As sessões continuam; o novo acesso vale em até 30 segundos. */
  async save(id: string, modulos: string[] | null, actor: AuthUser) {
    const target = await this.staffTarget(id, actor);
    const before = await this.customModules(id);
    if (modulos === null) {
      await this.prisma.configuracaoSistema.deleteMany({ where: { chave: KEY(id) } });
    } else {
      const unknown = modulos.filter((key) => !ACCESS_KEYS.includes(key));
      if (unknown.length) throw new BadRequestException(`Função desconhecida: ${unknown.join(', ')}.`);
      const clean = ACCESS_KEYS.filter((key) => modulos.includes(key));
      await this.prisma.configuracaoSistema.upsert({ where: { chave: KEY(id) }, create: { chave: KEY(id), valor: JSON.stringify({ modulos: clean }) }, update: { valor: JSON.stringify({ modulos: clean }) } });
    }
    forgetAccess(id);
    await this.audit.record(this.prisma, { entidade: 'usuario', entidadeId: id, evento: 'usuario.acesso_funcoes', atorId: actor.id, payloadAntes: { modulos: before }, payloadDepois: { modulos: modulos === null ? null : ACCESS_KEYS.filter((key) => modulos.includes(key)), papel: target.papel } }).catch(() => undefined);
    return this.describe(id, actor);
  }
}
