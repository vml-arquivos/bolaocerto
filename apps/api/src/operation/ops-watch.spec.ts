import { HttpException, HttpStatus } from '@nestjs/common';
import { AlertService } from '../common/alert.service';
import { AllExceptionsFilter } from '../common/exceptions.filter';
import { OpsWatchService } from './ops-watch.service';

const cfg = (values: Record<string, string> = {}): any => ({ get: (key: string) => values[key] });

describe('AlertService', () => {
  const realFetch = global.fetch;
  afterEach(() => { global.fetch = realFetch; });

  it('sem webhook configurado não envia nada', async () => {
    const fetchMock = jest.fn(); global.fetch = fetchMock as any;
    expect(await new AlertService(cfg()).alert('k', 'texto')).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('envia uma vez por janela e inclui o rótulo do ambiente (text e content, para Slack e Discord)', async () => {
    const fetchMock = jest.fn().mockResolvedValue({ ok: true }); global.fetch = fetchMock as any;
    const alerts = new AlertService(cfg({ ALERT_WEBHOOK_URL: 'https://hooks.exemplo/x', ALERT_ENV_LABEL: 'PROD' }));
    expect(await alerts.alert('k', 'Algo quebrou')).toBe(true);
    expect(await alerts.alert('k', 'Algo quebrou')).toBe(false); // freio
    expect(await alerts.alert('outra', 'Outro problema')).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body)).toEqual({ text: '[PROD] Algo quebrou', content: '[PROD] Algo quebrou' });
  });

  it('falha do webhook não derruba quem chamou', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('rede')) as any;
    await expect(new AlertService(cfg({ ALERT_WEBHOOK_URL: 'https://hooks.exemplo/x' })).alert('k', 'x')).resolves.toBe(false);
  });
});

describe('AllExceptionsFilter', () => {
  const host = (): any => ({ switchToHttp: () => ({ getRequest: () => ({ method: 'GET', url: '/api/v1/x?a=1' }), getResponse: () => ({ status: jest.fn().mockReturnThis(), json: jest.fn(), send: jest.fn(), setHeader: jest.fn() }) }), getType: () => 'http' });

  it('alerta em erro 5xx e não alerta em 4xx', () => {
    const alerts: any = { alert: jest.fn().mockResolvedValue(true) };
    const filter = new AllExceptionsFilter(alerts);
    const spy = jest.spyOn(Object.getPrototypeOf(AllExceptionsFilter.prototype), 'catch').mockImplementation(() => undefined);
    filter.catch(new Error('banco caiu'), host());
    expect(alerts.alert).toHaveBeenCalledWith('5xx:GET /api/v1/x', expect.stringContaining('banco caiu'), expect.any(Number));
    alerts.alert.mockClear();
    filter.catch(new HttpException('inválido', HttpStatus.BAD_REQUEST), host());
    expect(alerts.alert).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});

describe('OpsWatchService', () => {
  function setup(opts: { unregistered?: any[]; overdue?: any[]; sync?: Date | null } = {}) {
    const prisma: any = {
      bolao: { findMany: jest.fn().mockImplementation(async ({ where }: any) => (where.status === 'registrado' ? opts.overdue ?? [] : opts.unregistered ?? [])) },
      concurso: { findFirst: jest.fn().mockResolvedValue(opts.sync === undefined ? { sincronizadoEm: new Date() } : opts.sync ? { sincronizadoEm: opts.sync } : null) },
    };
    const alerts: any = { alert: jest.fn().mockResolvedValue(true), isConfigured: () => true };
    return { service: new OpsWatchService(prisma, alerts, cfg({ PAYMENT_PROVIDER: 'cora', PAYMENTS_ENABLED: 'true', SMTP_HOST: 'smtp.x' })), alerts, prisma };
  }
  const pool = (over: any = {}) => ({ id: 'p1', grupo: { nome: 'Virada' }, concurso: { modalidade: 'megasena', numeroConcurso: 3012, cutoffAt: new Date(Date.now() + 3_600_000), dataSorteio: new Date(Date.now() + 7_200_000) }, cotas: [{ quantidade: 2 }, { quantidade: 3 }], ...over });

  it('tudo certo: painel ok e nenhum alerta', async () => {
    const { service, alerts } = setup();
    const snap = await service.snapshot();
    expect(snap).toMatchObject({ ok: true, pagamentos: { provedor: 'cora', habilitado: true }, email: { configurado: true }, alertas: { configurado: true } });
    await service.tick();
    expect(alerts.alert).not.toHaveBeenCalled();
  });

  it('aposta paga sem registro com o prazo chegando gera alerta com o total de cotas', async () => {
    const { service, alerts } = setup({ unregistered: [pool()] });
    const snap = await service.snapshot();
    expect(snap.ok).toBe(false);
    expect(snap.pendencias.apostasNaoRegistradas[0]).toMatchObject({ bolaoId: 'p1', cotasPagas: 5, atrasado: false });
    await service.tick();
    expect(alerts.alert).toHaveBeenCalledWith('registro:p1', expect.stringContaining('5 cota(s) paga(s)'), expect.any(Number));
  });

  it('prazo já vencido sem registro é marcado como atrasado', async () => {
    const { service } = setup({ unregistered: [pool({ concurso: { modalidade: 'quina', numeroConcurso: 1, cutoffAt: new Date(Date.now() - 600_000), dataSorteio: new Date(Date.now() + 600_000) } })] });
    expect((await service.unregisteredPools())[0]!.atrasado).toBe(true);
  });

  it('apuração atrasada e sincronização parada geram alertas', async () => {
    const { service, alerts } = setup({ overdue: [{ id: 'p9', concurso: { modalidade: 'lotofacil', numeroConcurso: 5, dataSorteio: new Date(Date.now() - 86_400_000) } }], sync: new Date(Date.now() - 5 * 3_600_000) });
    await service.tick();
    const keys = alerts.alert.mock.calls.map((call: any[]) => call[0]);
    expect(keys).toEqual(expect.arrayContaining(['apuracao:p9', 'sync-parada']));
  });

  it('nunca sincronizou conta como parada', async () => {
    const { service } = setup({ sync: null });
    expect(await service.syncStatus()).toMatchObject({ ok: false, ultima: null });
  });
});
