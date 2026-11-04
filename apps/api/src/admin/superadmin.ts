import { ForbiddenException } from '@nestjs/common';

/**
 * Superadmin = a conta principal do sistema: o administrador criado na instalação (e-mail em ADMIN_BOOTSTRAP_EMAIL).
 * Só ele pode apagar grupos e contas de pessoas (clientes, afiliados, equipe) que não tenham movimentação financeira,
 * ver Histórico, Conexões e Configurações e gerenciar outros administradores.
 */
export function isSuperAdmin(user: { email?: string | null; papel?: string | null }, env: NodeJS.ProcessEnv = process.env): boolean {
  const main = (env.ADMIN_BOOTSTRAP_EMAIL ?? '').trim().toLowerCase();
  return user.papel === 'admin' && main.length > 0 && String(user.email ?? '').trim().toLowerCase() === main;
}

/** Nível de cada conta: quanto maior, mais acima na hierarquia. Ninguém vê ou altera quem está acima do próprio nível. */
const RANK: Record<string, number> = { cotista: 0, afiliado: 1, operacao: 2, admin: 3 };
export const SUPERADMIN_RANK = 4;
export function rankOf(user: { email?: string | null; papel?: string | null }, env: NodeJS.ProcessEnv = process.env): number {
  if (isSuperAdmin(user, env)) return SUPERADMIN_RANK;
  return RANK[user.papel ?? 'cotista'] ?? 0;
}

/**
 * Quem pode agir sobre quem: a própria conta (sempre) ou uma conta de nível MENOR. Um administrador comum não toca no
 * superadmin nem em outro administrador; o superadmin gerencia todos.
 */
export function canManage(actor: { id?: string; email?: string | null; papel?: string | null }, target: { id?: string; email?: string | null; papel?: string | null }, env: NodeJS.ProcessEnv = process.env): boolean {
  if (actor.id && target.id && actor.id === target.id) return true;
  return rankOf(actor, env) > rankOf(target, env);
}

export function assertCanManage(actor: Parameters<typeof canManage>[0], target: Parameters<typeof canManage>[1], env: NodeJS.ProcessEnv = process.env): void {
  if (!canManage(actor, target, env)) throw new ForbiddenException('Você não tem permissão sobre uma conta de nível igual ou superior ao seu.');
}

/** Papéis que o ator pode conceder ou criar: sempre abaixo do próprio nível (só o superadmin cria administradores). */
export function assertCanGrantRole(actor: Parameters<typeof canManage>[0], papel: string, env: NodeJS.ProcessEnv = process.env): void {
  if ((RANK[papel] ?? 0) >= rankOf(actor, env)) throw new ForbiddenException('Você só pode criar ou conceder papéis abaixo do seu.');
}
