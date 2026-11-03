/**
 * Superadmin = a conta principal do sistema: o administrador criado na instalação (e-mail em ADMIN_BOOTSTRAP_EMAIL).
 * Só ele pode apagar grupos e contas de pessoas (clientes, afiliados, equipe) que não tenham movimentação financeira.
 */
export function isSuperAdmin(user: { email?: string | null; papel?: string | null }, env: NodeJS.ProcessEnv = process.env): boolean {
  const main = (env.ADMIN_BOOTSTRAP_EMAIL ?? '').trim().toLowerCase();
  return user.papel === 'admin' && main.length > 0 && String(user.email ?? '').trim().toLowerCase() === main;
}
