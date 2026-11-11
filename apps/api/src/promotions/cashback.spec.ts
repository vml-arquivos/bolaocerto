import { campaignKey, grantCampaignCashback } from './cashback';

const NOW = new Date('2026-11-11T12:00:00Z');
const camp = { id: 'k1', nome: 'Novembro', percentual: 5, valorMinimoCentavos: null, maximoPorCompraCentavos: null, orcamentoCentavos: null as number | null, ativa: true, inicioEm: null, fimEm: null, grupoIds: ['g1'], usuarioIds: [] as string[] };

function fakeTx(opts: { campaigns?: any[]; spent?: number; existing?: boolean; referral?: number } = {}) {
  const entries: any[] = [];
  const tx: any = {
    entries,
    grupoMembro: { findMany: async () => [{ grupoId: 'g1' }] },
    cashbackCampanha: { findMany: async () => opts.campaigns ?? [camp] },
    carteiraMovimento: {
      findFirst: async () => (opts.existing ? { id: 'x' } : null),
      findUnique: async () => (opts.referral ? { valorCentavos: opts.referral } : null),
      aggregate: async () => ({ _sum: { valorCentavos: opts.spent ?? 0 } }),
      create: async ({ data }: any) => { entries.push(data); return data; },
      findMany: async () => [],
    },
    $queryRaw: async () => [{ saldo: 0 }],
    $executeRaw: async () => 0,
    notificacao: { create: async () => ({}) },
  };
  return tx;
}
const pay = { pagamentoId: 'p1', compradorId: 'u1', paidCents: 10_000, feeCents: 1_000, commissionCents: 0, formaBaixa: 'pix', now: NOW };

describe('grantCampaignCashback', () => {
  it('chave é estável por campanha e pagamento', () => { expect(campaignKey('k1', 'p1')).toBe('camp:k1:p1'); });
  it('não dá cashback quando pagou com o saldo da carteira', async () => {
    const tx = fakeTx();
    expect(await grantCampaignCashback(tx, { ...pay, formaBaixa: 'saldo_bl' })).toBe(0);
    expect(tx.entries).toHaveLength(0);
  });
  it('não repete quando o pagamento já recebeu', async () => {
    expect(await grantCampaignCashback(fakeTx({ existing: true }), pay)).toBe(0);
  });
  it('sem campanha ativa para a pessoa não dá nada', async () => {
    expect(await grantCampaignCashback(fakeTx({ campaigns: [] }), pay)).toBe(0);
    expect(await grantCampaignCashback(fakeTx({ campaigns: [{ ...camp, ativa: true, grupoIds: ['g9'] }] }), pay)).toBe(0);
  });
  it('orçamento esgotado não dá nada', async () => {
    expect(await grantCampaignCashback(fakeTx({ campaigns: [{ ...camp, orcamentoCentavos: 500 }], spent: 500 }), pay)).toBe(0);
  });
});
