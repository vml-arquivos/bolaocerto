/** Papéis do sistema e para onde cada um vai ao entrar. */
export type Papel = 'cotista' | 'afiliado' | 'operacao' | 'admin';

export const roleLabels: Record<string, string> = { cotista: 'Cliente / cotista', afiliado: 'Afiliado', operacao: 'Equipe de operação', admin: 'Administrador' };

export const isStaff = (papel?: string | null) => papel === 'admin' || papel === 'operacao';

/** Tela inicial de cada papel. */
export function homeForRole(papel?: string | null) {
  if (papel === 'admin') return '/admin';
  if (papel === 'operacao') return '/admin?view=operacao';
  if (papel === 'afiliado') return '/afiliado';
  return '/aplicativo';
}

/** Telas de painel que a equipe de operação pode usar (as demais são só do administrador). */
export const STAFF_VIEWS = ['operacao'] as const;

/** Telas só da conta principal do sistema (a API também bloqueia os demais administradores). */
export const SUPERADMIN_VIEWS = ['conexoes', 'auditoria', 'configuracoes'] as const;

const SHARED_PREFIXES = ['/boloes', '/aplicativo', '/minha-conta', '/resultados', '/estatisticas', '/checkout'];
const ALLOWED_NEXT: Record<Papel, string[]> = {
  cotista: SHARED_PREFIXES,
  afiliado: [...SHARED_PREFIXES, '/afiliado', '/bolao-afiliado'],
  operacao: ['/admin'],
  admin: ['/admin', ...SHARED_PREFIXES, '/afiliado'],
};

/** Para onde levar depois do login: o pedido original (`next`) só vale se o papel pode abrir aquela tela. */
export function landingFor(papel: string | null | undefined, next?: string | null) {
  const role = (['cotista', 'afiliado', 'operacao', 'admin'].includes(String(papel)) ? papel : 'cotista') as Papel;
  if (next && next.startsWith('/') && !next.startsWith('//') && !next.includes('\\')) {
    const path = next.split(/[?#]/)[0]!;
    if (ALLOWED_NEXT[role].some((prefix) => path === prefix || path.startsWith(`${prefix}/`))) {
      if (role === 'operacao') return homeForRole(role);
      return next;
    }
  }
  return homeForRole(role);
}
