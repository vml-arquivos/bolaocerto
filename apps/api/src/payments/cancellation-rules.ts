import { StatusCota, StatusPagamento } from '@prisma/client';

/** Prazo (dias) para o cliente pedir o cancelamento de uma cota paga. Código de Defesa do Consumidor, art. 49: 7 dias. */
export function cancelWindowDays(raw: string | undefined = process.env.CANCELAMENTO_PRAZO_DIAS): number {
  const days = Number(raw);
  return Number.isFinite(days) && days >= 1 ? Math.floor(days) : 7;
}

export type CancellationInfo = { tipo: 'reserva' | 'pedido' | 'nenhum'; pode: boolean; ate: Date | null; motivoBloqueio: string | null };

/** O que o cliente pode fazer para cancelar: cancelar a reserva (não paga) ou pedir o cancelamento (paga, dentro do prazo e antes do registro da aposta). */
export function cancellationInfo(
  share: { status: StatusCota; pagamento?: { status: StatusPagamento; confirmadoEm: Date | null; criadoEm: Date } | null },
  days = cancelWindowDays(),
  now = new Date(),
): CancellationInfo {
  if (share.status === StatusCota.reservada) return { tipo: 'reserva', pode: true, ate: null, motivoBloqueio: null };
  if (share.status !== StatusCota.paga) {
    const registered = ([StatusCota.registrada, StatusCota.apurada, StatusCota.premiada] as StatusCota[]).includes(share.status);
    return { tipo: 'nenhum', pode: false, ate: null, motivoBloqueio: registered ? 'A aposta já foi registrada na loteria e não pode mais ser desfeita. Se precisar de ajuda, fale com o suporte.' : null };
  }
  const base = share.pagamento?.confirmadoEm ?? share.pagamento?.criadoEm ?? now;
  const until = new Date(base.getTime() + days * 86_400_000);
  if (until.getTime() < now.getTime()) return { tipo: 'pedido', pode: false, ate: until, motivoBloqueio: `O prazo de ${days} dias para pedir o cancelamento terminou. Se precisar de ajuda, fale com o suporte.` };
  return { tipo: 'pedido', pode: true, ate: until, motivoBloqueio: null };
}
