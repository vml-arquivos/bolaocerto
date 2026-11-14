import { ConflictException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { ShareSaleTransferService } from './share-sale-transfer.service';

const D = (value: number) => new Prisma.Decimal(value);
const principal = { id: 'p1', email: 'principal@x.com', papel: 'admin' } as any;
const comum = { id: 'a2', email: 'comum@x.com', papel: 'admin' } as any;

function setup(over: { share?: any; target?: any } = {}) {
  const share = {
    id: 'c1', status: 'paga', quantidade: 2, afiliadoReferenciaId: 'af-old',
    afiliadoReferencia: { id: 'af-old', aprovadoPor: 'p1', codigoAfiliado: 'OLD', usuarioId: 'u-old', usuario: { nome: 'Antigo' } },
    pagamento: { id: 'pg1', status: 'confirmado', valorTaxaAdmin: D(8), valorComissaoAfiliado: D(0.8) },
    comissao: { id: 'cm1', afiliadoId: 'af-old', valor: D(0.8), status: 'pendente', loteRepasseId: null },
    bolao: { id: 'b1', concurso: { modalidade: 'megasena', numeroConcurso: 3000 } },
    ...over.share,
  };
  const target = over.target === undefined ? { id: 'af-new', statusAprovacao: 'aprovado', aprovadoPor: 'p1', comissaoPadraoPct: D(25), codigoAfiliado: 'NEW', usuarioId: 'u-new', usuario: { nome: 'Novo' } } : over.target;
  const tx: any = {
    cota: { update: jest.fn() }, pagamento: { update: jest.fn() },
    comissao: { update: jest.fn(async ({ data }: any) => ({ afiliadoId: data.afiliadoId ?? 'af-old', valor: data.valor ?? D(0.8), status: data.status })), create: jest.fn(async ({ data }: any) => ({ afiliadoId: data.afiliadoId, valor: data.valor, status: data.status })) },
  };
  const prisma: any = { cota: { findUnique: jest.fn().mockResolvedValue(share) }, afiliado: { findUnique: jest.fn().mockResolvedValue(target) }, $transaction: async (fn: any) => fn(tx) };
  const audit = { record: jest.fn() };
  const notifications = { notify: jest.fn().mockResolvedValue(undefined) };
  return { service: new ShareSaleTransferService(prisma, audit as any, notifications as any), tx, audit, notifications };
}

describe('Transferir a venda de uma cota', () => {
  const OLD = process.env.ADMIN_BOOTSTRAP_EMAIL;
  beforeEach(() => { process.env.ADMIN_BOOTSTRAP_EMAIL = 'principal@x.com'; });
  afterEach(() => { if (OLD === undefined) delete process.env.ADMIN_BOOTSTRAP_EMAIL; else process.env.ADMIN_BOOTSTRAP_EMAIL = OLD; });

  it('passa a venda e a comissão para o novo afiliado, com o percentual dele sobre a mesma taxa', async () => {
    const { service, tx, audit, notifications } = setup();
    const result = await service.transfer('c1', { afiliadoId: 'af-new', motivo: 'venda feita pelo Novo' }, principal);
    expect(tx.cota.update).toHaveBeenCalledWith({ where: { id: 'c1' }, data: { afiliadoReferenciaId: 'af-new' } });
    expect(Number(tx.pagamento.update.mock.calls[0][0].data.valorComissaoAfiliado)).toBe(2);
    const data = tx.comissao.update.mock.calls[0][0].data;
    expect(data).toMatchObject({ afiliadoId: 'af-new', status: 'pendente' });
    expect(Number(data.valor)).toBe(2); expect(Number(data.baseCalculo)).toBe(8); expect(Number(data.percentual)).toBe(25);
    expect(result).toMatchObject({ valorComissao: '2.00', vendaConfirmada: true, afiliado: { id: 'af-new' } });
    expect(audit.record.mock.calls[0][1]).toMatchObject({ evento: 'cota.venda_transferida', payloadAntes: { afiliadoId: 'af-old' } });
    expect(notifications.notify.mock.calls.map((call: any[]) => call[0])).toEqual(['u-new', 'u-old']);
  });

  it('cota sem afiliado: cria a comissão do novo afiliado', async () => {
    const { service, tx } = setup({ share: { afiliadoReferenciaId: null, afiliadoReferencia: null, comissao: null } });
    await service.transfer('c1', { afiliadoId: 'af-new' }, principal);
    expect(tx.comissao.create.mock.calls[0][0].data).toMatchObject({ cotaId: 'c1', afiliadoId: 'af-new', status: 'pendente' });
  });

  it('venda direta: tira o afiliado e cancela a comissão pendente', async () => {
    const { service, tx } = setup();
    await service.transfer('c1', { afiliadoId: null }, principal);
    expect(tx.cota.update.mock.calls[0][0].data.afiliadoReferenciaId).toBeNull();
    expect(tx.comissao.update.mock.calls[0][0].data.status).toBe('cancelada');
    expect(Number(tx.pagamento.update.mock.calls[0][0].data.valorComissaoAfiliado)).toBe(0);
  });

  it('reserva ainda não paga: muda a referência e o valor que vai virar comissão no pagamento', async () => {
    const { service, tx } = setup({ share: { status: 'reservada', pagamento: { id: 'pg1', status: 'pendente', valorTaxaAdmin: D(8), valorComissaoAfiliado: D(0.8) }, comissao: null } });
    const result = await service.transfer('c1', { afiliadoId: 'af-new' }, principal);
    expect(Number(tx.pagamento.update.mock.calls[0][0].data.valorComissaoAfiliado)).toBe(2);
    expect(tx.comissao.create).not.toHaveBeenCalled(); expect(tx.comissao.update).not.toHaveBeenCalled();
    expect(result.vendaConfirmada).toBe(false);
  });

  it('nunca paga duas vezes: comissão paga ou em lote de pagamento não é transferida', async () => {
    await expect(setup({ share: { comissao: { id: 'cm1', afiliadoId: 'af-old', valor: D(0.8), status: 'paga', loteRepasseId: null } } }).service.transfer('c1', { afiliadoId: 'af-new' }, principal)).rejects.toThrow(/já foi paga/);
    await expect(setup({ share: { comissao: { id: 'cm1', afiliadoId: 'af-old', valor: D(0.8), status: 'pendente', loteRepasseId: 'l1' } } }).service.transfer('c1', { afiliadoId: 'af-new' }, principal)).rejects.toThrow(/lote de pagamento/);
  });

  it('recusa: cota cancelada, mesmo afiliado, afiliado não aprovado', async () => {
    await expect(setup({ share: { status: 'cancelada' } }).service.transfer('c1', { afiliadoId: 'af-new' }, principal)).rejects.toBeInstanceOf(ConflictException);
    await expect(setup().service.transfer('c1', { afiliadoId: 'af-old' }, principal)).rejects.toThrow(/já é deste afiliado/);
    await expect(setup({ target: { id: 'af-new', statusAprovacao: 'pendente' } }).service.transfer('c1', { afiliadoId: 'af-new' }, principal)).rejects.toBeInstanceOf(NotFoundException);
  });

  it('administrador comum só mexe entre os afiliados que ele trouxe', async () => {
    await expect(setup().service.transfer('c1', { afiliadoId: 'af-new' }, comum)).rejects.toBeInstanceOf(ForbiddenException);
    const mine = { afiliadoReferencia: { id: 'af-old', aprovadoPor: 'a2', codigoAfiliado: 'OLD', usuarioId: 'u-old', usuario: { nome: 'Antigo' } } };
    await expect(setup({ share: mine }).service.transfer('c1', { afiliadoId: 'af-new' }, comum)).rejects.toThrow(/afiliados que você trouxe/);
    await expect(setup({ share: mine, target: { id: 'af-new', statusAprovacao: 'aprovado', aprovadoPor: 'a2', comissaoPadraoPct: D(10), codigoAfiliado: 'NEW', usuarioId: 'u-new', usuario: { nome: 'Novo' } } }).service.transfer('c1', { afiliadoId: 'af-new' }, comum)).resolves.toMatchObject({ valorComissao: '0.80' });
  });
});
