import { effectiveLimit, LIMIT_INCREASE_DELAY_MS, monthStartBrazil, ResponsiblePlayService } from './responsible-play.service';

const DAY = 86_400_000;

function setup(initial: Record<string, unknown> = {}, cotas: Array<Record<string, unknown>> = [], valorCota = 50) {
  const user: Record<string, any> = { id: 'u1', pausaAte: null, pausaPermanente: false, limiteMensal: null, limiteMensalPendente: null, limiteMensalPendenteEm: null, ...initial };
  const audits: string[] = [];
  const prisma: any = {
    usuario: { findUnique: async () => ({ ...user }), update: async ({ data }: any) => { Object.assign(user, data); return user; } },
    cota: { findMany: async () => cotas },
    bolao: { findUnique: async () => ({ valorCota }) },
    $transaction: async (fn: any) => fn(prisma),
  };
  const audit: any = { record: async (_tx: unknown, input: { evento: string }) => { audits.push(input.evento); } };
  return { service: new ResponsiblePlayService(prisma, audit), user, audits };
}
const cota = (quantidade: number, status = 'paga', extra: Record<string, unknown> = {}) => ({ quantidade, status, expiraReservaEm: null, bolao: { valorCota: 50 }, ...extra });

describe('effectiveLimit', () => {
  const now = new Date('2026-10-18T12:00:00Z');
  it('usa o limite atual até o prazo do pendente passar', () => {
    expect(effectiveLimit({ limiteMensal: 100, limiteMensalPendente: 500, limiteMensalPendenteEm: new Date(now.getTime() + 1000) }, now)).toBe(100);
    expect(effectiveLimit({ limiteMensal: 100, limiteMensalPendente: 500, limiteMensalPendenteEm: new Date(now.getTime() - 1000) }, now)).toBe(500);
    expect(effectiveLimit({ limiteMensal: 100, limiteMensalPendente: null, limiteMensalPendenteEm: new Date(now.getTime() - 1000) }, now)).toBeNull();
    expect(effectiveLimit({ limiteMensal: null, limiteMensalPendente: null, limiteMensalPendenteEm: null }, now)).toBeNull();
  });
  it('mês de Brasília começa no dia 1 às 00:00 (-03:00)', () => {
    expect(monthStartBrazil(new Date('2026-10-18T12:00:00Z')).toISOString()).toBe('2026-10-01T03:00:00.000Z');
    expect(monthStartBrazil(new Date('2026-11-01T01:00:00Z')).toISOString()).toBe('2026-10-01T03:00:00.000Z'); // ainda é 31/10 em Brasília
  });
});

describe('ResponsiblePlayService', () => {
  it('sem pausa e sem limite, deixa comprar', async () => {
    await expect(setup().service.assertCanBuy('u1', 'p1', 5)).resolves.toBeUndefined();
  });

  it('pausa por dias bloqueia e não pode ser encurtada', async () => {
    const { service, user } = setup();
    await service.pause('u1', { dias: 60 });
    const until = user.pausaAte as Date;
    expect(until.getTime() - Date.now()).toBeGreaterThan(59 * DAY);
    await expect(service.assertCanBuy('u1', 'p1', 1)).rejects.toThrow(/pausou sua participação até/);
    await service.pause('u1', { dias: 30 });
    expect(user.pausaAte).toEqual(until); // 30 não reduz os 60 já escolhidos
    await expect(service.pause('u1', { dias: 15 })).rejects.toThrow(/30, 60 ou 90/);
  });

  it('pausa permanente bloqueia e manda falar com o suporte', async () => {
    const { service } = setup();
    await service.pause('u1', { permanente: true });
    await expect(service.assertCanBuy('u1', 'p1', 1)).rejects.toThrow(/indeterminado/);
    expect((await service.status('u1')).pausada).toBe(true);
  });

  it('pausa vencida deixa de bloquear', async () => {
    const { service } = setup({ pausaAte: new Date(Date.now() - 1000) });
    await expect(service.assertCanBuy('u1', 'p1', 1)).resolves.toBeUndefined();
    expect((await service.status('u1')).pausada).toBe(false);
  });

  it('definir ou diminuir o limite vale na hora', async () => {
    const { service, user, audits } = setup();
    await service.setLimit('u1', 500);
    expect(Number(user.limiteMensal)).toBe(500);
    await service.setLimit('u1', 200);
    expect(Number(user.limiteMensal)).toBe(200);
    expect(user.limiteMensalPendenteEm).toBeNull();
    expect(audits).toEqual(['conta.limite', 'conta.limite']);
  });

  it('aumentar ou remover o limite só vale em 24 h', async () => {
    const { service, user } = setup({ limiteMensal: 200 });
    const raised = await service.setLimit('u1', 1000);
    expect(raised.limiteMensal).toBe(200);
    expect(raised.limitePendente?.valor).toBe(1000);
    expect(raised.limitePendente!.aplicaEm.getTime() - Date.now()).toBeGreaterThan(LIMIT_INCREASE_DELAY_MS - 5000);
    const removed = await service.setLimit('u1', null);
    expect(removed.limiteMensal).toBe(200);
    expect(removed.limitePendente?.valor).toBeNull();
    // passadas 24 h o pendente é consolidado
    user.limiteMensalPendenteEm = new Date(Date.now() - 1000);
    const later = await service.status('u1');
    expect(later.limiteMensal).toBeNull();
    expect(later.limitePendente).toBeNull();
  });

  it('voltar ao valor atual cancela o pedido de aumento', async () => {
    const { service } = setup({ limiteMensal: 200, limiteMensalPendente: 900, limiteMensalPendenteEm: new Date(Date.now() + 3600_000) });
    const out = await service.setLimit('u1', 200);
    expect(out.limitePendente).toBeNull();
  });

  it('compra que passa do limite do mês é recusada, dentro do limite passa', async () => {
    const paid = [cota(4), cota(2, 'registrada')]; // 6 cotas x 50 = R$ 300 no mês
    const { service } = setup({ limiteMensal: 500 }, paid);
    await expect(service.assertCanBuy('u1', 'p1', 4)).resolves.toBeUndefined(); // +200 = 500, exatamente o limite
    await expect(service.assertCanBuy('u1', 'p1', 5)).rejects.toThrow(/passa do seu limite mensal de R\$\s?500,00/);
    await expect(service.assertCanBuy('u1', 'p1', 5)).rejects.toThrow(/ainda pode usar R\$\s?200,00/);
  });

  it('reserva vencida não conta no gasto do mês; reserva ativa conta', async () => {
    const rows = [cota(10, 'reservada', { expiraReservaEm: new Date(Date.now() - 60_000) }), cota(2, 'reservada', { expiraReservaEm: new Date(Date.now() + 60_000) })];
    const { service } = setup({ limiteMensal: 1000 }, rows);
    expect(await service.spentThisMonth('u1')).toBe(100);
  });

  it('o status mostra gasto e quanto resta', async () => {
    const { service } = setup({ limiteMensal: 400 }, [cota(3)]);
    const status = await service.status('u1');
    expect(status).toMatchObject({ limiteMensal: 400, gastoNoMes: 150, restante: 250, pausada: false });
  });
});
