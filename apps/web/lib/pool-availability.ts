export type Availability = {
  status: string; cotasDisponiveis: number | null;
  concurso?: { cutoffAt?: string; status?: string };
  resultado?: unknown;
  liberacao?: { condicional: boolean; liberado: boolean };
  regrasVenda?: { inicioEm?: string | null; fimEm?: string | null } | null;
};
/** Janela de venda escolhida pelo administrador (além do prazo do concurso). */
export function saleRuleState(pool: Availability, now: number): 'em_breve' | 'aberta' | 'encerrada' {
  const start = Date.parse(pool.regrasVenda?.inicioEm ?? '');
  const end = Date.parse(pool.regrasVenda?.fimEm ?? '');
  if (Number.isFinite(start) && now < start) return 'em_breve';
  if (Number.isFinite(end) && now >= end) return 'encerrada';
  return 'aberta';
}
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
  return withinSaleWindow(pool, now) && saleRuleState(pool, now) === 'aberta' && hasShares(pool) && !(pool.liberacao?.condicional && !pool.liberacao.liberado);
}
