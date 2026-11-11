import { ConflictException, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AdminService } from '../admin/admin.service';
import { LotteriesService } from './lotteries.service';

type Where = Record<string, unknown>;

function lotteries(extra: Record<string, unknown> = {}) {
  const findMany = jest.fn(async () => []);
  const prisma = { concurso: { findMany, ...extra } };
  const audit = { record: jest.fn() };
  return { service: new LotteriesService(prisma as never, { get: () => undefined } as unknown as ConfigService, audit as never), findMany, audit, prisma };
}
const isHeal = (where: Where) => JSON.stringify(where).includes('isNot');
const firstWhere = (mock: jest.Mock): Where => (mock.mock.calls as unknown as Array<[{ where: Where }]>).map((call) => call[0].where).find((where) => !isHeal(where))!;

describe('concursos de festa fora da lista de abertos', () => {
  it('lista pública normal traz os da CAIXA e a festa que já tem número oficial, mas não a provisória', async () => {
    const { service, findMany } = lotteries();
    await service.list();
    expect(firstWhere(findMany)).toMatchObject({ status: 'aberto', OR: [{ especial: null }, { numeroDefinido: true }] });
  });

  it('só traz festa quando pedida (tipo=festa) e traz tudo com tipo=todos', async () => {
    const a = lotteries(); await a.service.list(undefined, 'aberto', 'festa');
    expect(firstWhere(a.findMany)).toMatchObject({ especial: { not: null } });
    const b = lotteries(); await b.service.list(undefined, 'aberto', 'todos');
    expect(firstWhere(b.findMany)).not.toHaveProperty('especial');
  });

  it('histórico continua trazendo festas já encerradas', async () => {
    const { service, findMany } = lotteries();
    await service.list(undefined, 'apurado');
    expect(firstWhere(findMany)).toEqual({ status: 'apurado' });
  });

  it('painel: "Em aberto" traz tudo que está à venda (inclusive festa e cadastro manual) e "Festas" só as festas, ambas com prazo no futuro', async () => {
    const findMany = jest.fn(async () => []);
    const prisma = { concurso: { findMany, count: jest.fn(async () => 0) } };
    const admin = new AdminService(prisma as never, { record: jest.fn() } as never);
    await admin.listContests({ status: 'aberto' });
    expect(firstWhere(findMany)).toMatchObject({ status: 'aberto' });
    expect(firstWhere(findMany)).not.toHaveProperty('especial');
    findMany.mockClear();
    await admin.listContests({ status: 'festas' });
    expect(firstWhere(findMany)).toMatchObject({ status: 'aberto', especial: { not: null } });
    findMany.mockClear();
    await admin.listContests({ status: 'historico' });
    expect(firstWhere(findMany)).not.toHaveProperty('especial');
  });
});

describe('remover data de festa', () => {
  it('remove a festa sem bolão e registra no histórico', async () => {
    const del = jest.fn(async () => ({}));
    const { service, audit } = lotteries({ findUnique: jest.fn(async () => ({ id: 'f1', especial: 'mega-da-virada', nomeEspecial: 'Mega da Virada', modalidade: 'megasena', dataSorteio: new Date(), _count: { boloes: 0 } })), delete: del });
    await expect(service.deleteFestival('f1', 'admin1')).resolves.toEqual({ removido: true });
    expect(del).toHaveBeenCalledWith({ where: { id: 'f1' } });
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ evento: 'concurso.festa_removida', atorId: 'admin1' }));
  });

  it('não remove festa que já tem bolão', async () => {
    const del = jest.fn();
    const { service } = lotteries({ findUnique: jest.fn(async () => ({ id: 'f1', especial: 'x', _count: { boloes: 1 } })), delete: del });
    await expect(service.deleteFestival('f1')).rejects.toBeInstanceOf(ConflictException);
    expect(del).not.toHaveBeenCalled();
  });

  it('não remove concurso normal da CAIXA nem id que não existe', async () => {
    const normal = lotteries({ findUnique: jest.fn(async () => ({ id: 'c1', especial: null, _count: { boloes: 0 } })), delete: jest.fn() });
    await expect(normal.service.deleteFestival('c1')).rejects.toBeInstanceOf(NotFoundException);
    const missing = lotteries({ findUnique: jest.fn(async () => null), delete: jest.fn() });
    await expect(missing.service.deleteFestival('nada')).rejects.toBeInstanceOf(NotFoundException);
  });
});

describe('situação por modalidade', () => {
  it('diz se há concurso aberto e qual é o último conhecido (sem contar festas)', async () => {
    const future = new Date(Date.now() + 3_600_000); const past = new Date(Date.now() - 3_600_000);
    const findFirst = jest.fn(async ({ where }: { where: { modalidade: string; especial: unknown } }) => where.modalidade === 'megasena'
      ? { numeroConcurso: 3081, status: 'fechado', dataSorteio: past, cutoffAt: past, sincronizadoEm: past }
      : where.modalidade === 'quina' ? { numeroConcurso: 7000, status: 'aberto', dataSorteio: future, cutoffAt: future, sincronizadoEm: past } : null);
    const { service } = lotteries({ findFirst });
    const result = await service.situationByModality();
    expect(result.find((row) => row.modalidade === 'megasena')).toMatchObject({ aberto: false, ultimo: { numero: 3081, status: 'fechado' } });
    expect(result.find((row) => row.modalidade === 'quina')).toMatchObject({ aberto: true, ultimo: { numero: 7000 } });
    expect(result.find((row) => row.modalidade === 'lotofacil')).toEqual({ modalidade: 'lotofacil', ultimo: null, aberto: false });
    expect(findFirst).toHaveBeenCalledWith(expect.objectContaining({ where: expect.objectContaining({ especial: null }) }));
  });
});
