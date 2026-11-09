import { addEntry, cashbackCents, grantReferralCashback, parseCashbackPct, unwindWalletForPayment, walletBalance } from './wallet';

describe('regras da carteira', () => {
  it('lê o percentual de cashback com segurança', () => {
    expect(parseCashbackPct(undefined)).toBe(0);
    expect(parseCashbackPct('')).toBe(0);
    expect(parseCashbackPct('abc')).toBe(0);
    expect(parseCashbackPct('-5')).toBe(0);
    expect(parseCashbackPct('10')).toBe(10);
    expect(parseCashbackPct('12,5')).toBe(12.5);
    expect(parseCashbackPct('500')).toBe(100);
  });
  it('cashback é % da taxa e nunca passa do que sobra depois da comissão do afiliado', () => {
    expect(cashbackCents(10, 0, 20)).toBe(200);
    expect(cashbackCents(10, 0, 0)).toBe(0);
    expect(cashbackCents(10, 9, 50)).toBe(100); // sobra só R$ 1,00
    expect(cashbackCents(10, 12, 50)).toBe(0);
    expect(cashbackCents(3.33, 0, 10)).toBe(33); // arredonda para baixo
  });
});

function fakeTx(opts: { pct?: string; buyer?: any; referrer?: any } = {}) {
  const entries: any[] = [];
  const notices: any[] = [];
  const tx: any = {
    configuracaoSistema: { findUnique: async () => (opts.pct === undefined ? null : { valor: opts.pct }) },
    usuario: { findUnique: async ({ where }: any) => (where.id === 'comprador' ? opts.buyer ?? { indicadoPorUsuarioId: 'indicador' } : opts.referrer ?? { id: where.id, desativadoEm: null }) },
    carteiraMovimento: {
      findUnique: async ({ where }: any) => entries.find((e) => e.chave === where.chave) ?? null,
      create: async ({ data }: any) => { entries.push(data); return data; },
      aggregate: async ({ where }: any) => ({ _sum: { valorCentavos: entries.filter((e) => e.usuarioId === where.usuarioId).reduce((s, e) => s + e.valorCentavos, 0) || null } }),
    },
    notificacao: { create: async ({ data }: any) => { notices.push(data); } },
    $queryRaw: async () => [],
  };
  return { tx, entries, notices };
}

describe('cashback por indicação', () => {
  it('desligado por padrão (sem configuração não credita nada)', async () => {
    const { tx, entries } = fakeTx();
    expect(await grantReferralCashback(tx, { pagamentoId: 'p1', compradorId: 'comprador', taxaAdmin: 10, comissaoAfiliado: 0 })).toBe(0);
    expect(entries).toHaveLength(0);
  });
  it('credita quem indicou e avisa, uma vez só por pagamento', async () => {
    const { tx, entries, notices } = fakeTx({ pct: '20' });
    expect(await grantReferralCashback(tx, { pagamentoId: 'p1', compradorId: 'comprador', taxaAdmin: 10, comissaoAfiliado: 0 })).toBe(200);
    expect(await grantReferralCashback(tx, { pagamentoId: 'p1', compradorId: 'comprador', taxaAdmin: 10, comissaoAfiliado: 0 })).toBe(0);
    expect(entries).toEqual([expect.objectContaining({ usuarioId: 'indicador', valorCentavos: 200, chave: 'cashback:p1', tipo: 'cashback_indicacao' })]);
    expect(notices).toHaveLength(1);
    expect(await walletBalance(tx, 'indicador')).toBe(200);
  });
  it('não paga quem não foi indicado, indicação de si mesmo nem conta desativada', async () => {
    for (const opts of [{ buyer: { indicadoPorUsuarioId: null } }, { buyer: { indicadoPorUsuarioId: 'comprador' } }, { referrer: { id: 'indicador', desativadoEm: new Date() } }]) {
      const { tx, entries } = fakeTx({ pct: '20', ...opts });
      expect(await grantReferralCashback(tx, { pagamentoId: 'p1', compradorId: 'comprador', taxaAdmin: 10, comissaoAfiliado: 0 })).toBe(0);
      expect(entries).toHaveLength(0);
    }
  });
  it('estorno desfaz o cashback e devolve o saldo usado na compra', async () => {
    const { tx, entries } = fakeTx({ pct: '20' });
    await grantReferralCashback(tx, { pagamentoId: 'p1', compradorId: 'comprador', taxaAdmin: 10, comissaoAfiliado: 0 });
    await unwindWalletForPayment(tx, { pagamentoId: 'p1', compradorId: 'comprador', formaBaixa: 'saldo_bl', valorBruto: 35 });
    await unwindWalletForPayment(tx, { pagamentoId: 'p1', compradorId: 'comprador', formaBaixa: 'saldo_bl', valorBruto: 35 }); // repetir não duplica
    expect(await walletBalance(tx, 'comprador')).toBe(3500);
    expect(await walletBalance(tx, 'indicador')).toBe(0);
    expect(entries.map((e) => e.tipo)).toEqual(['cashback_indicacao', 'estorno_compra', 'estorno_cashback']);
  });
  it('lançamento com valor zero ou fracionado é recusado', async () => {
    const { tx } = fakeTx();
    await expect(addEntry(tx, { usuarioId: 'u', tipo: 'x', valorCentavos: 0, descricao: 'x' })).rejects.toThrow();
    await expect(addEntry(tx, { usuarioId: 'u', tipo: 'x', valorCentavos: 1.5, descricao: 'x' })).rejects.toThrow();
  });
});
