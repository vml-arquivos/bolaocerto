/**
 * Tempo máximo sem atividade antes de pedir login de novo (por segurança, para tela esquecida aberta).
 * Equipe (administrador e operação): 30 minutos. Afiliado e cliente: 60 minutos.
 * Dá para trocar com SESSION_IDLE_MINUTES_STAFF e SESSION_IDLE_MINUTES, mas nunca abaixo de 5 minutos nem acima de 24 horas.
 */
export const DEFAULT_IDLE_MINUTES_STAFF = 30;
export const DEFAULT_IDLE_MINUTES = 60;

const clamp = (value: number) => Math.min(Math.max(Math.round(value), 5), 24 * 60);

export function sessionIdleMinutes(papel: string | null | undefined, read: (key: string) => string | undefined): number {
  const staff = papel === 'admin' || papel === 'operacao';
  const raw = Number(read(staff ? 'SESSION_IDLE_MINUTES_STAFF' : 'SESSION_IDLE_MINUTES'));
  return clamp(Number.isFinite(raw) && raw > 0 ? raw : staff ? DEFAULT_IDLE_MINUTES_STAFF : DEFAULT_IDLE_MINUTES);
}
