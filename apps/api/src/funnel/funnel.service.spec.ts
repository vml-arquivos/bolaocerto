import { BadRequestException } from '@nestjs/common';
import { brazilDay, FUNNEL_EVENTS, FunnelService } from './funnel.service';

function make(over: Record<string, unknown> = {}) {
  const prisma: any = {
    $executeRaw: jest.fn(async () => 1),
    contadorFunil: { groupBy: jest.fn(async () => [{ nome: 'visita_home', _sum: { total: 200 } }, { nome: 'bolao_visto', _sum: { total: 80 } }, { nome: 'cadastro_iniciado', _sum: { total: 20 } }]) },
    usuario: { count: jest.fn(async () => 10) },
    cota: { groupBy: jest.fn(async ({ where }: any) => (where.status ? [{ compradorId: 'a' }, { compradorId: 'b' }] : [{ compradorId: 'a' }, { compradorId: 'b' }, { compradorId: 'c' }, { compradorId: 'd' }])) },
    ...over,
  };
  return { service: new FunnelService(prisma), prisma };
}

describe('Funil de conversão', () => {
  it('só aceita as três etapas do navegador', () => {
    expect([...FUNNEL_EVENTS]).toEqual(['visita_home', 'bolao_visto', 'cadastro_iniciado']);
  });

  it('o dia é o de Brasília (23h de Brasília ainda é o mesmo dia)', () => {
    expect(brazilDay(new Date('2026-11-09T02:30:00Z'))).toBe('2026-11-08');
    expect(brazilDay(new Date('2026-11-09T03:00:00Z'))).toBe('2026-11-09');
  });

  it('registra somando 1 no dia, sem guardar nada da pessoa', async () => {
    const { service, prisma } = make();
    await service.record('visita_home', new Date('2026-11-09T15:00:00Z'));
    expect(prisma.$executeRaw).toHaveBeenCalledTimes(1);
    const [, ...values] = (prisma.$executeRaw as jest.Mock).mock.calls[0];
    expect(values).toEqual(['2026-11-09', 'visita_home']);
  });

  it('monta o funil com os percentuais entre etapas e sobre as visitas', async () => {
    const { service } = make();
    const report = await service.report('2026-10-01', '2026-10-31');
    expect(report.etapas.map((s) => [s.chave, s.total])).toEqual([
      ['visita_home', 200], ['bolao_visto', 80], ['cadastro_iniciado', 20], ['cadastro_concluido', 10], ['reserva', 4], ['pagamento', 2],
    ]);
    expect(report.etapas[1]).toMatchObject({ sobreAnterior: 40, sobreVisitas: 40 });
    expect(report.etapas[5]).toMatchObject({ sobreAnterior: 50, sobreVisitas: 1 });
    expect(report.etapas[0]!.sobreAnterior).toBeNull();
  });

  it('sem visitas não divide por zero e recusa período invertido', async () => {
    const { service } = make({ contadorFunil: { groupBy: jest.fn(async () => []) } });
    const report = await service.report('2026-10-01', '2026-10-02');
    expect(report.etapas[1]!.sobreAnterior).toBeNull();
    await expect(service.report('2026-11-02', '2026-11-01')).rejects.toThrow(BadRequestException);
  });
});
