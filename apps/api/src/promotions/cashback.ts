import { Prisma } from '@prisma/client';
import { addEntry, formatCents, lockWallet, WALLET_KINDS } from '../wallet/wallet';
import { userGroupIds } from './coupons';
import { BuyerStats, campaignApplies, campaignCashbackCents, hasLevel, inPeriod } from './promo-math';

type Db = Prisma.TransactionClient;

export const campaignKey = (campaignId: string, paymentId: string) => `camp:${campaignId}:${paymentId}`;

/** Quanto da campanha já foi dado (créditos menos estornos), em centavos. */
export async function campaignSpentCents(db: Pick<Db, 'carteiraMovimento'>, campaignId: string): Promise<number> {
  const sum = await db.carteiraMovimento.aggregate({ where: { OR: [{ chave: { startsWith: `camp:${campaignId}:` } }, { chave: { startsWith: `ecamp:${campaignId}:` } }] }, _sum: { valorCentavos: true } });
  return sum._sum.valorCentavos ?? 0;
}

/** Quanto o cliente já pagou e quantas compras já pagou (pagamentos confirmados), sem contar o pagamento indicado. */
export async function buyerStats(db: Pick<Db, 'pagamento'>, userId: string, excludePaymentId?: string): Promise<BuyerStats> {
  const sum = await db.pagamento.aggregate({ where: { status: 'confirmado', cota: { compradorId: userId }, ...(excludePaymentId ? { id: { not: excludePaymentId } } : {}) }, _sum: { valorBruto: true }, _count: { _all: true } });
  return { spentCents: Math.round(Number(sum._sum.valorBruto ?? 0) * 100), purchases: sum._count._all };
}

/** Condição de busca das campanhas que podem valer para esta pessoa: por grupo/cliente escolhido ou por nível de gasto/compras. */
export function campaignCandidatesWhere(userId: string, groups: string[]): Prisma.CashbackCampanhaWhereInput {
  return { ativa: true, OR: [{ usuarioIds: { has: userId } }, ...(groups.length ? [{ grupoIds: { hasSome: groups } }] : []), { gastoMinimoCentavos: { not: null } }, { comprasMinimas: { not: null } }] };
}

/**
 * Depois que o pagamento é confirmado: se há campanha de cashback ativa para esta pessoa, entra crédito na carteira.
 * Vale uma campanha por compra (a que der mais), no máximo uma vez por pagamento, e nunca passa da taxa que sobra,
 * do teto por compra nem do orçamento da campanha. Compra paga com o próprio saldo da carteira não gera cashback.
 */
export async function grantCampaignCashback(tx: Db, input: { pagamentoId: string; compradorId: string; paidCents: number; feeCents: number; commissionCents: number; formaBaixa: string | null; now?: Date }): Promise<number> {
  if (input.formaBaixa === 'saldo_bl' || input.formaBaixa === 'cupom' || input.paidCents <= 0) return 0;
  const now = input.now ?? new Date();
  const already = await tx.carteiraMovimento.findFirst({ where: { chave: { startsWith: 'camp:', endsWith: `:${input.pagamentoId}` } }, select: { id: true } });
  if (already) return 0;
  const groups = await userGroupIds(tx, input.compradorId);
  const campaigns = await tx.cashbackCampanha.findMany({ where: campaignCandidatesWhere(input.compradorId, groups), take: 100 });
  // O nível de gasto/compras só é consultado quando alguma campanha precisa dele.
  const stats = campaigns.some((campaign) => hasLevel(campaign)) ? await buyerStats(tx, input.compradorId, input.pagamentoId) : null;
  const eligible = campaigns.filter((campaign) => inPeriod(campaign, now) && campaignApplies(campaign, input.compradorId, groups, stats));
  if (!eligible.length) return 0;
  const referral = await tx.carteiraMovimento.findUnique({ where: { chave: `cashback:${input.pagamentoId}` }, select: { valorCentavos: true } });
  const alreadyGrantedCents = Math.max(0, referral?.valorCentavos ?? 0);

  const cents = async (campaign: (typeof eligible)[number]) => campaignCashbackCents({
    paidCents: input.paidCents, feeCents: input.feeCents, commissionCents: input.commissionCents, alreadyGrantedCents,
    percentual: Number(campaign.percentual), minimumCents: campaign.valorMinimoCentavos, maxPerPurchaseCents: campaign.maximoPorCompraCentavos,
    budgetLeftCents: campaign.orcamentoCentavos === null ? null : campaign.orcamentoCentavos - await campaignSpentCents(tx, campaign.id),
  });
  let best: { campaign: (typeof eligible)[number]; cents: number } | null = null;
  for (const campaign of eligible) {
    const value = await cents(campaign);
    if (value > 0 && (!best || value > best.cents)) best = { campaign, cents: value };
  }
  if (!best) return 0;
  // Trava a campanha e a carteira e refaz a conta: dois pagamentos ao mesmo tempo não passam do orçamento.
  await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtext(${`campanha:${best.campaign.id}`}))::text`;
  const finalCents = await cents(best.campaign);
  if (finalCents <= 0) return 0;
  await lockWallet(tx, input.compradorId);
  const created = await addEntry(tx, { usuarioId: input.compradorId, tipo: WALLET_KINDS.campaignCashback, valorCentavos: finalCents, descricao: `Cashback: ${best.campaign.nome}`.slice(0, 200), chave: campaignKey(best.campaign.id, input.pagamentoId) });
  if (!created) return 0;
  await tx.notificacao.create({ data: { usuarioId: input.compradorId, canal: 'push', tipo: 'carteira.cashback', payload: { titulo: 'Você ganhou cashback', mensagem: `${formatCents(finalCents)} entraram na sua carteira (${best.campaign.nome}).`, link: '/minha-conta?aba=carteira' } } });
  return finalCents;
}
