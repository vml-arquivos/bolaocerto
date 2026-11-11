import { approvalAlert, betAlert, betBucket, proofAlert, paymentReminderText, reminderStep, settlementAlert } from './reminders';
import { RemindersWatcher } from './reminders.watcher';

const MIN = 60_000;
const t0 = new Date('2026-11-10T15:00:00Z');
const at = (min: number) => new Date(t0.getTime() + min * MIN);

describe('lembrete de pagamento', () => {
  it('reserva de 15 min: lembra aos 5 min e de novo quando faltam 3', () => {
    const exp = at(15);
    expect(reminderStep(t0, exp, at(2))).toBeNull();
    expect(reminderStep(t0, exp, at(5))).toBe(1);
    expect(reminderStep(t0, exp, at(11))).toBe(1);
    expect(reminderStep(t0, exp, at(12))).toBe(2);
    expect(reminderStep(t0, exp, at(15))).toBeNull();
    expect(reminderStep(t0, exp, at(16))).toBeNull();
  });
  it('reserva longa: 5 min depois do início e 5 min antes do fim', () => {
    const exp = at(60);
    expect(reminderStep(t0, exp, at(4))).toBeNull();
    expect(reminderStep(t0, exp, at(5))).toBe(1);
    expect(reminderStep(t0, exp, at(55))).toBe(2);
  });
  it('mensagens curtas e sem explicação', () => {
    expect(paymentReminderText(1, 'Ana').mensagem).toContain('Ana');
    expect(paymentReminderText(2, '').titulo).toBe('Última chamada');
    expect(paymentReminderText(1, '').mensagem.startsWith('Sua cota')).toBe(true);
  });
});

describe('avisos de tarefas da equipe', () => {
  const now = t0;
  it('faixas de urgência mudam a chave (um aviso por faixa)', () => {
    expect(betBucket(at(60 * 30), now).faixa).toBe('novo');
    expect(betBucket(at(60 * 20), now).faixa).toBe('24h');
    expect(betBucket(at(60 * 5), now).faixa).toBe('6h');
    expect(betBucket(at(60), now)).toEqual({ faixa: '2h', urgente: true });
    expect(betBucket(at(-30), now).faixa).toBe('atrasado-0');
    expect(betBucket(at(-130), now).faixa).toBe('atrasado-1');
  });
  it('texto do bolão para apostar e do atrasado', () => {
    const pool = { id: 'p1', modalidade: 'megasena', numero: 3050, cutoffAt: at(120), cotasPagas: 3 };
    const ok = betAlert(pool, now);
    expect(ok.mensagem).toContain('Mega-Sena #3050');
    expect(ok.mensagem).toContain('3 cotas pagas');
    expect(ok.link).toBe('/admin?view=operacao');
    const late = betAlert({ ...pool, cutoffAt: at(-5), cotasPagas: 1 }, now);
    expect(late.titulo).toBe('Aposta atrasada!');
    expect(late.urgente).toBe(true);
  });
  it('aprovação repete a cada 12 h e apuração a cada 6 h', () => {
    expect(approvalAlert({ id: 'a', solicitadaEm: now }, at(60)).chave).toBe('aprovar:a:0');
    expect(approvalAlert({ id: 'a', solicitadaEm: now }, at(60 * 13)).chave).toBe('aprovar:a:1');
    expect(settlementAlert({ id: 's', modalidade: 'quina', numero: 1, sorteio: at(-60 * 13) }, now).chave).toBe('apurar:s:2');
  });
});

describe('proofAlert (bolão à venda sem comprovante do jogo)', () => {
  const now = new Date('2026-11-11T12:00:00Z');
  const at = (hours: number) => new Date(now.getTime() + hours * 3_600_000);
  const pool = { id: 'p1', modalidade: 'megasena', numero: 10, cotasPagas: 0 };
  it('avisa todo dia enquanto falta tempo e muda a chave de um dia para o outro', () => {
    const a = proofAlert({ ...pool, cutoffAt: at(100) }, now);
    const b = proofAlert({ ...pool, cutoffAt: at(100) }, new Date(now.getTime() + 25 * 3_600_000));
    expect(a.chave).toMatch(/^registro:p1:novo-/);
    expect(a.chave).not.toBe(b.chave);
    expect(a.urgente).toBe(false);
    expect(a.titulo).toBe('Falta o comprovante do jogo');
  });
  it('sobe a urgência perto do sorteio e diz quando passou do prazo', () => {
    expect(proofAlert({ ...pool, cutoffAt: at(1) }, now)).toMatchObject({ chave: 'registro:p1:2h', urgente: true, titulo: 'Falta registrar o jogo agora' });
    expect(proofAlert({ ...pool, cutoffAt: at(-1) }, now)).toMatchObject({ urgente: true, titulo: 'Registro do jogo atrasado!' });
  });
  it('quando os números ainda não foram definidos, o aviso pede os dois', () => {
    expect(proofAlert({ ...pool, cutoffAt: at(30), semNumeros: true }, now).mensagem).toContain('Definir os números');
    expect(proofAlert({ ...pool, cutoffAt: at(30) }, now).mensagem).not.toContain('Definir os números');
  });
});

function watcherSetup() {
  const notifs: any[] = [];
  const shares: any[] = [];
  const prisma: any = {
    notificacao: { findMany: async ({ where }: any) => notifs.filter((n) => n.tipo === where.tipo), create: async ({ data }: any) => { notifs.push(data); return data; } },
    cota: { findMany: async () => shares },
    bolao: { findMany: async ({ where }: any) => where.status === 'rascunho' ? [{ id: 'ap1', aprovacaoSolicitadaEm: new Date() }] : where.status?.in ? [{ id: 'pb1', concurso: { modalidade: 'quina', numeroConcurso: 7, cutoffAt: new Date(Date.now() + 90 * MIN) }, cotas: [{ quantidade: 2 }] }] : [] },
    usuario: { findMany: async () => [{ id: 'adm', papel: 'admin' }, { id: 'op', papel: 'operacao' }] },
  };
  const service: any = { notify: async (usuarioId: string, tipo: string, payload: any) => { notifs.push({ usuarioId, tipo, payload }); } };
  return { watcher: new RemindersWatcher(prisma, service), notifs, shares };
}

describe('RemindersWatcher', () => {
  it('cotista que não pagou recebe cada lembrete uma vez só', async () => {
    const { watcher, notifs, shares } = watcherSetup();
    shares.push({ id: 'c1', compradorId: 'u1', reservadaEm: new Date(Date.now() - 6 * MIN), expiraReservaEm: new Date(Date.now() + 9 * MIN), comprador: { nome: 'Maria Souza' } });
    expect(await watcher.remindUnpaid()).toBe(1);
    expect(await watcher.remindUnpaid()).toBe(0);
    expect(notifs[0]).toMatchObject({ usuarioId: 'u1', tipo: 'pagamento.lembrete', payload: { link: '/minha-conta', semEmail: true } });
    expect(notifs[0].payload.mensagem).toContain('Maria');
    shares[0].expiraReservaEm = new Date(Date.now() + 2 * MIN);
    expect(await watcher.remindUnpaid()).toBe(1);
    expect(notifs[1].payload.titulo).toBe('Última chamada');
    expect(notifs[1].payload.semEmail).toBe(false);
  });
  it('equipe: admin e operação recebem aposta pendente; só o admin recebe aprovação; sem repetir', async () => {
    const { watcher, notifs } = watcherSetup();
    expect(await watcher.alertStaff()).toBe(3);
    const byUser = (id: string) => notifs.filter((n) => n.usuarioId === id).length;
    expect(byUser('adm')).toBe(2);
    expect(byUser('op')).toBe(1);
    expect(await watcher.alertStaff()).toBe(0);
  });
});

describe('RemindersWatcher: bolão à venda sem comprovante', () => {
  const build = (paid: boolean) => {
    const cutoffAt = new Date(Date.now() + 5 * 24 * 3_600_000);
    const open = { id: 'np1', numerosApostados: [], concurso: { modalidade: 'quina', numeroConcurso: 9, cutoffAt }, _count: { jogos: 0 } };
    const prisma: any = {
      bolao: { findMany: async ({ where }: any) => where.status === 'aberto' ? [open] : where.status?.in ? (paid ? [{ id: 'np1', concurso: { modalidade: 'quina', numeroConcurso: 9, cutoffAt }, cotas: [{ quantidade: 1 }] }] : []) : [] },
    };
    return new RemindersWatcher(prisma, { notify: async () => undefined } as any);
  };
  it('sem cota paga: pede o comprovante e os números', async () => {
    const alerts = await build(false).collectTaskAlerts();
    expect(alerts).toHaveLength(1);
    expect(alerts[0]).toMatchObject({ titulo: 'Falta o comprovante do jogo' });
    expect(alerts[0]!.mensagem).toContain('Definir os números');
  });
  it('com cota paga já existe o aviso de apostar: não repete o de registro', async () => {
    const alerts = await build(true).collectTaskAlerts();
    expect(alerts.map((alert) => alert.chave.split(':')[0])).toEqual(['apostar']);
  });
});

