import { NotFoundException } from '@nestjs/common';
import { describeNotification, NotificationsService } from './notifications.service';
import { PoolReleaseWatcher } from './pool-release.watcher';

function setup(opts: { smtp?: boolean } = {}) {
  const notifs: any[] = [];
  const interests: any[] = [];
  const pools: any[] = [{ id: 'p1', premioMinimoLiberacao: 100_000_000, liberadoEm: null, status: 'aberto', grupo: { nome: 'Virada' }, concurso: { numeroConcurso: 3012, valorEstimadoPremio: 120_000_000 } }];
  const sent: any[] = [];
  const prisma: any = {
    notificacao: {
      create: async ({ data }: any) => { const row = { id: `n${notifs.length + 1}`, lidoEm: null, enviadoEm: null, criadoEm: new Date(), ...data }; notifs.push(row); return row; },
      findMany: async ({ where }: any) => notifs.filter((n) => (where.usuarioId ? n.usuarioId === where.usuarioId : n.enviadoEm === null)).map((n) => ({ ...n, usuario: { email: 'maria@exemplo.com', nome: 'Maria Souza' } })),
      count: async ({ where }: any) => notifs.filter((n) => n.usuarioId === where.usuarioId && n.lidoEm === null).length,
      updateMany: async ({ where, data }: any) => { let count = 0; for (const n of notifs) if ((where.id === undefined || n.id === where.id) && (where.usuarioId === undefined || n.usuarioId === where.usuarioId) && (where.lidoEm === null ? n.lidoEm === null : true) && (where.enviadoEm === null ? n.enviadoEm === null : true)) { Object.assign(n, data); count += 1; } return { count }; },
      findFirst: async ({ where }: any) => notifs.find((n) => n.id === where.id && n.usuarioId === where.usuarioId) ?? null,
    },
    bolao: {
      findUnique: async ({ where }: any) => pools.find((p) => p.id === where.id) ?? null,
      findMany: async () => pools.filter((p) => p.premioMinimoLiberacao !== null && p.liberadoEm === null && p.status === 'aberto'),
      updateMany: async ({ where, data }: any) => { const p = pools.find((x) => x.id === where.id && x.liberadoEm === null); if (!p) return { count: 0 }; Object.assign(p, data); return { count: 1 }; },
    },
    bolaoInteresse: {
      count: async ({ where }: any) => interests.filter((i) => i.bolaoId === where.bolaoId).length,
      findUnique: async ({ where }: any) => interests.find((i) => i.bolaoId === where.bolaoId_usuarioId.bolaoId && i.usuarioId === where.bolaoId_usuarioId.usuarioId) ?? null,
      upsert: async ({ where, create }: any) => { const k = where.bolaoId_usuarioId; let row = interests.find((i) => i.bolaoId === k.bolaoId && i.usuarioId === k.usuarioId); if (!row) { row = { id: `i${interests.length + 1}`, notificadoEm: null, ...create }; interests.push(row); } return row; },
      deleteMany: async ({ where }: any) => { for (let i = interests.length - 1; i >= 0; i -= 1) if (interests[i].bolaoId === where.bolaoId && interests[i].usuarioId === where.usuarioId) interests.splice(i, 1); return { count: 1 }; },
      findMany: async ({ where }: any) => interests.filter((i) => (where.bolaoId ? i.bolaoId === where.bolaoId : true) && i.notificadoEm === null && (where.bolao ? pools.find((p) => p.id === i.bolaoId)?.liberadoEm : true)),
      updateMany: async ({ where, data }: any) => { const i = interests.find((x) => x.id === where.id && x.notificadoEm === null); if (!i) return { count: 0 }; Object.assign(i, data); return { count: 1 }; },
    },
    $transaction: async (fn: any) => fn(prisma),
  };
  const mail: any = { isConfigured: () => Boolean(opts.smtp), publicUrl: () => 'https://bl.exemplo', send: async (m: any) => { sent.push(m); return true; } };
  const service = new NotificationsService(prisma, mail);
  const audit: any = { record: async () => undefined };
  const watcher = new PoolReleaseWatcher(prisma, audit, service);
  return { service, watcher, notifs, interests, pools, sent };
}

describe('Notificações e "avise-me"', () => {
  it('textos padrão por tipo', () => {
    expect(describeNotification('cota.premiada', { mensagem: 'x' }).titulo).toMatch(/premiada/);
    expect(describeNotification('pagamento.confirmado', {}).link).toBe('/minha-conta');
    expect(describeNotification('qualquer', {}).titulo).toBe('Aviso do BL');
  });

  it('lista, conta não lidas e marca como lida', async () => {
    const { service, notifs } = setup();
    await service.notify('u1', 'pagamento.confirmado', { mensagem: 'ok' });
    await service.notify('u2', 'pagamento.confirmado', { mensagem: 'de outro' });
    const list = await service.list('u1');
    expect(list.naoLidas).toBe(1);
    expect(list.items).toHaveLength(1);
    await service.markRead('u1', notifs[0].id);
    expect((await service.list('u1')).naoLidas).toBe(0);
    await expect(service.markRead('u1', notifs[1].id)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('pedir aviso é idempotente e só vale para bolão condicional ainda bloqueado', async () => {
    const { service, interests, pools } = setup();
    await service.subscribe('p1', 'u1');
    await service.subscribe('p1', 'u1');
    expect(interests).toHaveLength(1);
    expect((await service.interestStatus('p1', 'u1')).inscrito).toBe(true);
    pools[0].liberadoEm = new Date();
    expect((await service.subscribe('p1', 'u2')).inscrito).toBe(false);
    pools[0].premioMinimoLiberacao = null; pools[0].liberadoEm = null;
    await expect(service.subscribe('p1', 'u3')).rejects.toBeInstanceOf(NotFoundException);
    await service.unsubscribe('p1', 'u1');
    expect(interests).toHaveLength(0);
  });

  it('o vigia libera o bolão que atingiu o gatilho e avisa cada interessado uma única vez', async () => {
    const { service, watcher, notifs, pools } = setup();
    await service.subscribe('p1', 'u1');
    await service.subscribe('p1', 'u2');
    expect(await watcher.releaseReachedPools()).toBe(1);
    expect(pools[0].liberadoEm).toBeInstanceOf(Date);
    expect(notifs.filter((n) => n.tipo === 'bolao.liberado')).toHaveLength(2);
    expect(await watcher.releaseReachedPools()).toBe(0);
    expect(await service.notifyPoolReleased('p1')).toBe(0);
    expect(notifs).toHaveLength(2);
  });

  it('não libera quem ainda não atingiu o gatilho', async () => {
    const { watcher, pools } = setup();
    pools[0].concurso.valorEstimadoPremio = 80_000_000;
    expect(await watcher.releaseReachedPools()).toBe(0);
    expect(pools[0].liberadoEm).toBeNull();
  });

  it('avisa quem ficou sem aviso quando o bolão foi liberado por outro caminho', async () => {
    const { service, watcher, notifs, pools } = setup();
    await service.subscribe('p1', 'u1');
    pools[0].liberadoEm = new Date();
    expect(await watcher.notifyAlreadyReleased()).toBe(1);
    expect(notifs).toHaveLength(1);
  });

  it('e-mail: só envia com SMTP, uma vez por aviso, e escapa o HTML', async () => {
    const off = setup({ smtp: false });
    await off.service.notify('u1', 'pagamento.confirmado', { mensagem: 'ok' });
    expect(await off.service.dispatchPending()).toEqual({ enviados: 0, falhas: 0 });
    expect(off.sent).toHaveLength(0);

    const on = setup({ smtp: true });
    await on.service.notify('u1', 'pagamento.confirmado', { mensagem: '<script>alert(1)</script>' });
    expect(await on.service.dispatchPending()).toEqual({ enviados: 1, falhas: 0 });
    expect(await on.service.dispatchPending()).toEqual({ enviados: 0, falhas: 0 });
    expect(on.sent[0].html).not.toContain('<script>');
    expect(on.sent[0].text).toContain('https://bl.exemplo/minha-conta');
  });
});
