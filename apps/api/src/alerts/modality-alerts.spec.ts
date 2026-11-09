import { notifyModalityWatchers } from './modality-alerts';
import { ModalityAlertsController } from './modality-alerts.controller';

const pool = { id: 'p1', modalidade: 'megasena', nomeModalidade: 'Mega-Sena', numeroConcurso: 2901, valorCota: 25, grupoTipo: 'oficial', criadoPor: 'admin1' };
const db = (watchers: Array<{ usuarioId: string }>) => {
  const created: any[] = [];
  return { created, client: { alertaModalidade: { findMany: jest.fn().mockResolvedValue(watchers) }, notificacao: { createMany: jest.fn(async ({ data }: any) => { created.push(...data); }) } } };
};

describe('avise-me por modalidade', () => {
  it('avisa quem pediu, com link para o bolão', async () => {
    const { client, created } = db([{ usuarioId: 'u1' }, { usuarioId: 'u2' }]);
    expect(await notifyModalityWatchers(client, pool)).toBe(2);
    expect(created).toHaveLength(2);
    expect(created[0]).toMatchObject({ usuarioId: 'u1', canal: 'push', tipo: 'bolao.novo', payload: { titulo: 'Novo bolão de Mega-Sena', link: '/boloes/p1' } });
  });
  it('não avisa quem publicou nem bolão de grupo de afiliado', async () => {
    const own = db([{ usuarioId: 'admin1' }]);
    expect(await notifyModalityWatchers(own.client, pool)).toBe(0);
    const affiliate = db([{ usuarioId: 'u1' }]);
    expect(await notifyModalityWatchers(affiliate.client, { ...pool, grupoTipo: 'afiliado' })).toBe(0);
    expect(affiliate.client.alertaModalidade.findMany).not.toHaveBeenCalled();
  });
  it('só considera contas ativas de cliente ou afiliado', async () => {
    const { client } = db([]);
    await notifyModalityWatchers(client, pool);
    expect((client.alertaModalidade.findMany.mock.calls[0] as any)[0].where).toMatchObject({ modalidade: 'megasena', usuario: { desativadoEm: null, papel: { in: ['cotista', 'afiliado'] } } });
  });
  it('falha no banco não propaga erro', async () => {
    await expect(notifyModalityWatchers({ alertaModalidade: { findMany: async () => { throw new Error('x'); } } }, pool)).resolves.toBe(0);
  });
});

describe('preferências de alerta', () => {
  it('grava só modalidades que existem, sem repetir', async () => {
    const ops: any[] = [];
    const prisma: any = {
      configLoteria: { findMany: async () => [{ modalidade: 'megasena', nomeExibicao: 'Mega-Sena' }, { modalidade: 'quina', nomeExibicao: 'Quina' }] },
      alertaModalidade: { deleteMany: (a: any) => { ops.push(['del', a]); return 'del'; }, createMany: (a: any) => { ops.push(['add', a]); return 'add'; } },
      $transaction: async (list: any[]) => list,
    };
    const controller = new ModalityAlertsController(prisma);
    const result = await controller.set({ modalidades: ['megasena', 'megasena', 'inventada', 'quina'] }, { id: 'u1', email: 'a@b.c', papel: 'cotista' });
    expect(result.modalidades).toEqual(['megasena', 'quina']);
    expect(ops[1][1].data).toEqual([{ usuarioId: 'u1', modalidade: 'megasena' }, { usuarioId: 'u1', modalidade: 'quina' }]);
  });
});
