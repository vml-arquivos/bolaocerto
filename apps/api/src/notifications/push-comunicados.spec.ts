import { CommunicationsService } from './communications.service';
import { NotificationsService } from './notifications.service';
import { PushService } from './push.service';

jest.mock('web-push', () => ({
  generateVAPIDKeys: () => ({ publicKey: 'PUB', privateKey: 'PRIV' }),
  sendNotification: jest.fn(async (sub: { endpoint: string }) => { if (sub.endpoint.includes('gone')) throw Object.assign(new Error('gone'), { statusCode: 410 }); }),
}));
// eslint-disable-next-line @typescript-eslint/no-require-imports
const webpush = require('web-push');

function fakeConfig(values: Record<string, string> = {}) { return { get: (k: string) => values[k] } as any; }

describe('PushService', () => {
  function setup(subs: any[] = []) {
    const settings: any[] = [];
    const prisma: any = {
      configuracaoSistema: {
        findMany: async () => settings,
        createMany: async ({ data }: any) => { for (const d of data) if (!settings.find((s) => s.chave === d.chave)) settings.push(d); return { count: data.length }; },
      },
      pushInscricao: {
        findMany: async () => subs,
        upsert: async ({ create }: any) => { subs.push({ id: `s${subs.length + 1}`, falhas: 0, ...create }); return subs[subs.length - 1]; },
        deleteMany: async ({ where }: any) => { for (let i = subs.length - 1; i >= 0; i -= 1) if ((where.id && subs[i].id === where.id) || (where.endpoint && subs[i].endpoint === where.endpoint)) subs.splice(i, 1); return { count: 1 }; },
        update: async () => ({}),
        count: async () => subs.length,
      },
    };
    return { service: new PushService(prisma, fakeConfig({ MAIL_FROM: 'BL <contato@exemplo.com.br>' })), prisma, settings, subs };
  }

  it('cria as chaves uma vez e guarda no banco', async () => {
    const { service, settings } = setup();
    expect(await service.publicKey()).toBe('PUB');
    expect(settings.map((s) => s.chave).sort()).toEqual(['vapid_private', 'vapid_public']);
  });

  it('usa as chaves das variáveis quando existem', async () => {
    const { prisma } = setup();
    const service = new PushService(prisma, fakeConfig({ VAPID_PUBLIC_KEY: 'ENV_PUB', VAPID_PRIVATE_KEY: 'ENV_PRIV' }));
    expect(await service.publicKey()).toBe('ENV_PUB');
  });

  it('envia a todos os aparelhos e remove o que expirou (410)', async () => {
    const subs = [
      { id: 'a', endpoint: 'https://push.exemplo/ok', p256dh: 'k', auth: 'a', falhas: 0 },
      { id: 'b', endpoint: 'https://push.exemplo/gone', p256dh: 'k', auth: 'a', falhas: 0 },
    ];
    const { service } = setup(subs);
    const delivered = await service.sendToUser('u1', { titulo: 'Oi', mensagem: 'Teste', link: '/minha-conta' });
    expect(delivered).toBe(1);
    expect(subs.map((s) => s.id)).toEqual(['a']);
    const [, body, options] = webpush.sendNotification.mock.calls.at(-2);
    expect(JSON.parse(body)).toMatchObject({ titulo: 'Oi', link: '/minha-conta' });
    expect(options.vapidDetails.subject).toBe('mailto:contato@exemplo.com.br');
  });
});

describe('Entrega de avisos', () => {
  function setup(opts: { payload?: any; tipo?: string } = {}) {
    const row: any = { id: 'n1', usuarioId: 'u1', tipo: opts.tipo ?? 'cota.recibo', payload: opts.payload ?? { anexoId: '11111111-1111-1111-1111-111111111111' }, enviadoEm: null, pushEnviadoEm: null, tentativas: 0, leaseToken: null, leaseAte: null, proximaTentativaEm: new Date(0), usuario: { nome: 'Maria Souza', email: 'maria@exemplo.com' } };
    const prisma: any = {
      notificacao: {
        findMany: jest.fn(async ({ where }: any) => (where.pushEnviadoEm === null ? (row.pushEnviadoEm ? [] : [{ ...row }]) : (row.enviadoEm ? [] : [{ ...row }]))),
        updateMany: jest.fn(async ({ where, data }: any) => {
          if (where.pushEnviadoEm === null && row.pushEnviadoEm) return { count: 0 };
          if (where.leaseToken && where.leaseToken !== row.leaseToken) return { count: 0 };
          const attempts = row.tentativas; Object.assign(row, data); if (typeof data.tentativas === 'object') row.tentativas = attempts + 1; return { count: 1 };
        }),
      },
      anexo: { findMany: jest.fn(async () => [{ id: 'x', nomeOriginal: 'comprovante.pdf', mime: 'application/pdf', tamanho: 10, caminho: '2026/11/x.pdf' }]) },
      cota: { findUnique: jest.fn(async () => ({ bolaoId: 'b1' })) },
    };
    const mail: any = { isConfigured: () => true, publicUrl: () => 'https://bl.exemplo', send: jest.fn(async () => true) };
    const push: any = { sendToUser: jest.fn(async () => 1) };
    const storage: any = { read: jest.fn(async () => Buffer.from('%PDF-1.4')) };
    return { row, prisma, mail, push, storage, service: new NotificationsService(prisma, mail, push, storage) };
  }

  it('anexa o comprovante no e-mail do cotista', async () => {
    const { service, mail } = setup();
    await service.dispatchPending();
    const sent = mail.send.mock.calls[0][0];
    expect(sent.attachments).toHaveLength(1);
    expect(sent.attachments[0].filename).toBe('comprovante.pdf');
    expect(sent.text).toContain('anexado');
  });

  it('na confirmação do pagamento, anexa os comprovantes do bolão já liberados', async () => {
    const { service, mail, prisma } = setup({ tipo: 'pagamento.confirmado', payload: { cotaId: '22222222-2222-2222-2222-222222222222' } });
    await service.dispatchPending();
    expect(prisma.cota.findUnique).toHaveBeenCalled();
    expect(mail.send.mock.calls[0][0].attachments).toHaveLength(1);
  });

  it('aviso só no celular não manda e-mail', async () => {
    const { service, mail, row } = setup({ tipo: 'comunicado', payload: { titulo: 'Oi', mensagem: 'Teste', semEmail: true } });
    await service.dispatchPending();
    expect(mail.send).not.toHaveBeenCalled();
    expect(row.enviadoEm).toBeInstanceOf(Date);
  });

  it('manda o push uma única vez por aviso', async () => {
    const { service, push, row } = setup({ tipo: 'comunicado', payload: { titulo: 'Jogo registrado', mensagem: 'Veja o comprovante', link: '/minha-conta' } });
    expect(await service.dispatchPushes()).toBe(1);
    expect(await service.dispatchPushes()).toBe(0);
    expect(push.sendToUser).toHaveBeenCalledTimes(1);
    expect(push.sendToUser).toHaveBeenCalledWith('u1', expect.objectContaining({ titulo: 'Jogo registrado', link: '/minha-conta' }));
    expect(row.pushEnviadoEm).toBeInstanceOf(Date);
  });
});

describe('Comunicados', () => {
  function setup() {
    const created: any[] = [];
    const prisma: any = {
      usuario: { count: jest.fn(async ({ where }: any) => (JSON.stringify(where).includes('pushInscricoes') && JSON.stringify(where).includes('AND') ? 2 : 5)), findMany: jest.fn(async () => [{ id: 'u1' }, { id: 'u2' }, { id: 'u3' }]) },
      bolao: { findUnique: jest.fn(async () => ({ id: 'b1' })) },
      grupo: { findUnique: jest.fn(async () => ({ id: 'g1' })) },
      comunicado: { create: jest.fn(async ({ data }: any) => ({ id: 'c1', ...data })), findMany: jest.fn(async () => []) },
      notificacao: { createMany: jest.fn(async ({ data }: any) => { created.push(...data); return { count: data.length }; }) },
    };
    const audit: any = { record: jest.fn(async () => undefined) };
    return { prisma, created, service: new CommunicationsService(prisma, audit) };
  }
  const admin: any = { id: 'adm', papel: 'admin', email: 'a@a.com' };

  it('cria um aviso para cada pessoa do público, sem e-mail por padrão', async () => {
    const { service, created } = setup();
    const result = await service.send({ publico: 'cotistas', titulo: 'Jogo registrado', mensagem: 'O comprovante já está na sua conta.' }, admin);
    expect(result.destinatarios).toBe(3);
    expect(created).toHaveLength(3);
    expect(created[0]).toMatchObject({ canal: 'push', tipo: 'comunicado', payload: { titulo: 'Jogo registrado', semEmail: true, link: '/minha-conta' } });
  });

  it('com e-mail marcado, o aviso também sai por e-mail', async () => {
    const { service, created } = setup();
    await service.send({ publico: 'todos', titulo: 'Novidade', mensagem: 'Novo bolão aberto', enviarEmail: true }, admin);
    expect((created[0].payload as any).semEmail).toBe(false);
  });

  it('exige bolão para o público "bolao" e recusa link externo', async () => {
    const { service } = setup();
    await expect(service.send({ publico: 'bolao', titulo: 'Aviso', mensagem: 'Teste' }, admin)).rejects.toThrow('Escolha o bolão');
    await expect(service.send({ publico: 'todos', titulo: 'Aviso', mensagem: 'Teste', link: 'https://outro.site' }, admin)).rejects.toThrow('link');
  });

  it('prévia mostra quantas pessoas e quantas têm aviso no celular', async () => {
    const { service } = setup();
    expect(await service.preview({ publico: 'todos' })).toEqual({ total: 5, comAvisoNoCelular: 2 });
  });
});
