import { Prisma } from '@prisma/client';
import { addEntry, formatCents, lockWallet, WALLET_KINDS } from '../wallet/wallet';
import { userGroupIds } from './coupons';
import { campaignCashbackCents, inAudience, inPeriod } from './promo-math';

type Db = Prisma.TransactionClient;

export const campaignKey = (campaignId: string, paymentId: string) => `camp:${campaignId}:${paymentId}`;

/** Quanto da campanha já foi dado (créditos menos estornos), em centavos. */
export async function campaignSpentCents(db: Pick<Db, 'carteiraMovimento'>, campaignId: string): Promise<number> {
  const sum = await db.carteiraMovimento.aggregate({ where: { OR: [{ chave: { startsWith: `camp:${campaignId}:` } }, { chave: { startsWith: `ecamp:${campaignId}:` } }] }, _sum: { valorCentavos: true } });
  return sum._sum.valorCentavos ?? 0;
}

/**
 * Depois que o pagamento é confirmado: se há campanha de cashback ativa para esta pessoa, entra crédito na carteira.
 * Vale uma campanha por compra (a que der mais), no máximo uma vez por pagamento, e nunca passa da taxa que sobra,
 * do teto por compra nem do orçamento da campanha. Compra paga com o próprio saldo da carteira não gera cashback.
 */
export async function grantCampaignCashback(tx: Db, input: { pagamentoId: string; compradorId: string; paidCents: number; feeCents: number; commissionCents: number; formaBaixa: string | null; now?: Date }): Promise<number> {
  if (input.formaBaixa === 'saldo_bl') return 0;
  const now = input.now ?? new Date();
  const already = await tx.carteiraMovimento.findFirst({ where: { chave: { startsWith: 'camp:', endsWith: `:${input.pagamentoId}` } }, select: { id: true } });
  if (already) return 0;
  const groups = await userGroupIds(tx, input.compradorId);
  const campaigns = await tx.cashbackCampanha.findMany({ where: { ativa: true, OR: [{ usuarioIds: { has: input.compradorId } }, ...(groups.length ? [{ grupoIds: { hasSome: groups } }] : [])] }, take: 50 });
  const eligible = campaigns.filter((campaign) => inPeriod(campaign, now) && inAudience({ grupoIds: campaign.grupoIds, usuarioIds: campaign.usuarioIds }, input.compradorId, groups));
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
