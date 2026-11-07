/**
 * Regra de exclusão de bolão.
 *
 * Pode excluir quando NÃO houve dinheiro de verdade: nenhum pagamento confirmado ou estornado,
 * nenhuma cota paga/registrada/apurada/premiada, nenhuma comissão paga, nenhuma nota fiscal emitida
 * e nenhuma reserva ainda valendo. O resto (testes, reservas vencidas, anexos, bolão já marcado como
 * registrado sem venda) pode ser apagado, mas exige confirmação forte (`forcar`).
 */
export interface DeletionShare {
  status: string;
  expiraReservaEm: Date | null;
  pagamento: { status: string; notaFiscal: { status: string } | null } | null;
  comissao: { status: string } | null;
  temMandato: boolean;
}

export interface DeletionInput {
  status: string;
  registradoEm: Date | null;
  comprovanteUrl: string | null;
  codigoBilhete: string | null;
  anexos: number;
  cotas: DeletionShare[];
}

export interface DeletionReport {
  podeExcluir: boolean;
  exigeConfirmacao: boolean;
  bloqueios: string[];
  avisos: string[];
  resumo: { cotas: number; pagamentos: number; anexos: number; registrado: boolean };
}

const PAID = ['paga', 'registrada', 'apurada', 'premiada'];

function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}

export function assessPoolDeletion(input: DeletionInput, now: Date = new Date()): DeletionReport {
  const bloqueios: string[] = [];
  const avisos: string[] = [];

  const paid = input.cotas.filter((share) => PAID.includes(share.status)).length;
  const confirmed = input.cotas.filter((share) => share.pagamento?.status === 'confirmado').length;
  const refunded = input.cotas.filter((share) => share.pagamento?.status === 'estornado' || share.status === 'estornada').length;
  const commissionPaid = input.cotas.filter((share) => share.comissao?.status === 'paga').length;
  const invoices = input.cotas.filter((share) => share.pagamento?.notaFiscal && ['emitida', 'cancelada'].includes(share.pagamento.notaFiscal.status)).length;
  const live = input.cotas.filter((share) => share.status === 'reservada' && (!share.expiraReservaEm || share.expiraReservaEm > now)).length;

  if (paid) bloqueios.push(`${plural(paid, 'cota paga ou registrada', 'cotas pagas ou registradas')}`);
  if (confirmed) bloqueios.push(`${plural(confirmed, 'pagamento confirmado', 'pagamentos confirmados')}`);
  if (refunded) bloqueios.push(`${plural(refunded, 'estorno no histórico', 'estornos no histórico')}`);
  if (commissionPaid) bloqueios.push(`${plural(commissionPaid, 'comissão já paga', 'comissões já pagas')}`);
  if (invoices) bloqueios.push(`${plural(invoices, 'nota fiscal emitida', 'notas fiscais emitidas')}`);
  if (live) bloqueios.push(`${plural(live, 'reserva ainda dentro do prazo de pagamento', 'reservas ainda dentro do prazo de pagamento')} (espere vencer ou cancele a cota)`);

  const registered = Boolean(input.registradoEm || input.comprovanteUrl || input.codigoBilhete || ['registrado', 'apurado'].includes(input.status));
  const leftovers = input.cotas.length;
  const payments = input.cotas.filter((share) => share.pagamento).length;
  if (registered) avisos.push('o bolão está marcado como registrado na lotérica');
  if (leftovers) avisos.push(`${plural(leftovers, 'cota cancelada/vencida será apagada', 'cotas canceladas/vencidas serão apagadas')}`);
  if (payments) avisos.push(`${plural(payments, 'cobrança pendente ou falha será apagada', 'cobranças pendentes ou com falha serão apagadas')}`);
  if (input.anexos) avisos.push(`${plural(input.anexos, 'anexo será apagado', 'anexos serão apagados')}`);

  return {
    podeExcluir: bloqueios.length === 0,
    exigeConfirmacao: bloqueios.length === 0 && avisos.length > 0,
    bloqueios,
    avisos,
    resumo: { cotas: leftovers, pagamentos: payments, anexos: input.anexos, registrado: registered },
  };
}
