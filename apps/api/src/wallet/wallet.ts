import { Prisma } from '@prisma/client';

/** Tipos de lançamento da carteira (crédito BL). Positivo = entra, negativo = sai. */
export const WALLET_KINDS = {
  cashback: 'cashback_indicacao',
  refundCredit: 'credito_reembolso',
  adminCredit: 'credito_ajuste',
  adminDebit: 'debito_ajuste',
  purchase: 'debito_compra',
  purchaseRefund: 'estorno_compra',
  cashbackReversal: 'estorno_cashback',
  campaignCashback: 'cashback_campanha',
  campaignReversal: 'estorno_cashback_campanha',
} as const;

export const KIND_LABELS: Record<string, string> = {
  cashback_indicacao: 'Cashback de indicação',
  credito_reembolso: 'Reembolso em crédito',
  credito_ajuste: 'Crédito do BL',
  debito_ajuste: 'Ajuste do BL',
  debito_compra: 'Compra de cota',
  estorno_compra: 'Compra estornada',
  estorno_cashback: 'Cashback desfeito',
  cashback_campanha: 'Cashback',
  estorno_cashback_campanha: 'Cashback desfeito',
};

export const CASHBACK_PCT_KEY = 'cashback_indicacao_pct';
export const MAX_CASHBACK_PCT = 100;

type Db = Pick<Prisma.TransactionClient, 'carteiraMovimento'>;
type DbRaw = Db & Pick<Prisma.TransactionClient, '$queryRaw'>;

export const toCents = (value: number | string | Prisma.Decimal): number => Math.round(Number(value) * 100);
export const centsToReais = (cents: number): number => cents / 100;

/** Percentual de cashback lido da configuração (texto). Inválido, negativo ou vazio = 0 (desligado). */
export function parseCashbackPct(raw: string | null | undefined): number {
  const value = Number(String(raw ?? '').replace(',', '.'));
  if (!Number.isFinite(value) || value <= 0) return 0;
  return Math.min(Math.round(value * 100) / 100, MAX_CASHBACK_PCT);
}

/** Cashback em centavos: % da taxa de serviço do BL, nunca acima do que sobra depois da comissão do afiliado. */
export function cashbackCents(feeReais: number, affiliateCommissionReais: number, pct: number): number {
  if (pct <= 0) return 0;
  const fee = toCents(feeReais);
  const room = Math.max(0, fee - toCents(affiliateCommissionReais));
  return Math.min(Math.floor((fee * pct) / 100), room);
}

export async function walletBalance(db: Db, userId: string): Promise<number> {
  const sum = await db.carteiraMovimento.aggregate({ where: { usuarioId: userId }, _sum: { valorCentavos: true } });
  return sum._sum.valorCentavos ?? 0;
}

/** Trava a carteira da pessoa dentro da transação: dois usos ao mesmo tempo não gastam o mesmo saldo. */
export async function lockWallet(db: DbRaw, userId: string): Promise<void> {
  // ::text porque o Prisma não sabe ler o tipo void que a função devolve.
  await db.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`carteira:${userId}`}))::text`;
}

/** Lança um movimento. Com `chave`, repetir o lançamento é ignorado (retorna false). */
export async function addEntry(db: Db, entry: { usuarioId: string; tipo: string; valorCentavos: number; descricao: string; chave?: string; criadoPor?: string }): Promise<boolean> {
  if (!Number.isInteger(entry.valorCentavos) || entry.valorCentavos === 0) throw new Error('Valor inválido para a carteira.');
  if (entry.chave) {
    const exists = await db.carteiraMovimento.findUnique({ where: { chave: entry.chave }, select: { id: true } });
    if (exists) return false;
  }
  await db.carteiraMovimento.create({ data: { usuarioId: entry.usuarioId, tipo: entry.tipo, valorCentavos: entry.valorCentavos, descricao: entry.descricao.slice(0, 200), chave: entry.chave ?? null, criadoPor: entry.criadoPor ?? null } });
  return true;
}

const brl = (cents: number) => centsToReais(cents).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
export const formatCents = brl;

/**
 * Cashback para quem indicou: quando o pagamento de uma pessoa indicada é confirmado, quem indicou ganha crédito.
 * Ligado só quando o administrador define um percentual maior que zero. Não paga indicação de si mesmo.
 */
export async function grantReferralCashback(tx: Prisma.TransactionClient, input: { pagamentoId: string; compradorId: string; taxaAdmin: number; comissaoAfiliado: number }): Promise<number> {
  const setting = await tx.configuracaoSistema.findUnique({ where: { chave: CASHBACK_PCT_KEY }, select: { valor: true } });
  const pct = parseCashbackPct(setting?.valor);
  if (pct <= 0) return 0;
  const buyer = await tx.usuario.findUnique({ where: { id: input.compradorId }, select: { indicadoPorUsuarioId: true } });
  const referrerId = buyer?.indicadoPorUsuarioId;
  if (!referrerId || referrerId === input.compradorId) return 0;
  const referrer = await tx.usuario.findUnique({ where: { id: referrerId }, select: { id: true, desativadoEm: true } });
  if (!referrer || referrer.desativadoEm) return 0;
  const cents = cashbackCents(input.taxaAdmin, input.comissaoAfiliado, pct);
  if (cents <= 0) return 0;
  const created = await addEntry(tx, { usuarioId: referrerId, tipo: WALLET_KINDS.cashback, valorCentavos: cents, descricao: 'Cashback: uma pessoa que você indicou comprou cotas', chave: `cashback:${input.pagamentoId}` });
  if (created) {
    await tx.notificacao.create({ data: { usuarioId: referrerId, canal: 'push', tipo: 'carteira.cashback', payload: { titulo: 'Você ganhou cashback', mensagem: `${brl(cents)} entraram na sua carteira por uma indicação.`, link: '/minha-conta?aba=carteira' } } });
  }
  return created ? cents : 0;
}

/** Cancelamento/estorno de um pagamento: devolve o saldo usado na compra e desfaz o cashback dado por ele. */
export async function unwindWalletForPayment(tx: Prisma.TransactionClient, input: { pagamentoId: string; compradorId: string; formaBaixa: string | null; valorBruto: number }): Promise<void> {
  if (input.formaBaixa === 'saldo_bl') {
    await lockWallet(tx, input.compradorId);
    await addEntry(tx, { usuarioId: input.compradorId, tipo: WALLET_KINDS.purchaseRefund, valorCentavos: toCents(input.valorBruto), descricao: 'Compra estornada: o valor voltou para a sua carteira', chave: `estorno_compra:${input.pagamentoId}` });
  }
  // Cashback de campanha dado por este pagamento (chave camp:<campanha>:<pagamento>): também volta.
  const campaigns = await tx.carteiraMovimento.findMany({ where: { chave: { startsWith: 'camp:', endsWith: `:${input.pagamentoId}` } }, select: { chave: true, usuarioId: true, valorCentavos: true } });
  for (const given of campaigns) {
    const campaignId = given.chave?.split(':')[1];
    if (!campaignId) continue;
    await lockWallet(tx, given.usuarioId);
    await addEntry(tx, { usuarioId: given.usuarioId, tipo: WALLET_KINDS.campaignReversal, valorCentavos: -given.valorCentavos, descricao: 'Cashback desfeito: a compra foi estornada', chave: `ecamp:${campaignId}:${input.pagamentoId}` });
  }
  const given = await tx.carteiraMovimento.findUnique({ where: { chave: `cashback:${input.pagamentoId}` }, select: { usuarioId: true, valorCentavos: true } });
  if (given) {
    await lockWallet(tx, given.usuarioId);
    await addEntry(tx, { usuarioId: given.usuarioId, tipo: WALLET_KINDS.cashbackReversal, valorCentavos: -given.valorCentavos, descricao: 'Cashback desfeito: a compra foi estornada', chave: `estorno_cashback:${input.pagamentoId}` });
  }
}
