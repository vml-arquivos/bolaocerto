export type Availability = {
  status: string; cotasDisponiveis: number | null;
  concurso?: { cutoffAt?: string; status?: string };
  resultado?: unknown;
  liberacao?: { condicional: boolean; liberado: boolean };
};
/** Missing/invalid deadline fails closed. A result always ends sales. */
export function withinSaleWindow(pool: Availability, now: number): boolean {
  const deadline = Date.parse(pool.concurso?.cutoffAt ?? '');
  return pool.status === 'aberto' && !pool.resultado &&
    (!pool.concurso?.status || pool.concurso.status === 'aberto') && Number.isFinite(deadline) && deadline > now;
}
export function hasShares(pool: Availability): boolean {
  return pool.cotasDisponiveis === null || pool.cotasDisponiveis > 0;
}
export function canPurchase(pool: Availability, now: number): boolean {
  return withinSaleWindow(pool, now) && hasShares(pool) && !(pool.liberacao?.condicional && !pool.liberacao.liberado);
}
