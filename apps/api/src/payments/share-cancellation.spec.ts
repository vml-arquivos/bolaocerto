import { ConflictException, NotFoundException } from '@nestjs/common';
import { cancelWindowDays, cancellationInfo } from './cancellation-rules';
import { PaymentsService } from './payments.service';

const user = { id: 'u1', email: 'cliente@example.invalid', papel: 'cotista' as const };
const admin = { id: 'admin', email: 'admin@example.invalid', papel: 'admin' as const };
const day = 86_400_000;
const reserved = { id: 's1', bolaoId: 'b1', compradorId: 'u1', quantidade: 2, status: 'reservada', titularNome: 'Ana', pagamento: null };
const paidAt = (daysAgo: number, extra: object = {}) => ({ id: 's1', bolaoId: 'b1', compradorId: 'u1', quantidade: 1, status: 'paga', titularNome: 'Ana', bolao: { concurso: { modalidade: 'quina', numeroConcurso: 7165 } }, pagamento: { id: 'p1', status: 'confirmado', origem: 'gateway', formaBaixa: 'pix', valorBruto: '5.00', confirmadoEm: new Date(Date.now() - daysAgo * day), criadoEm: new Date(Date.now() - daysAgo * day), notaFiscal: null, ...extra } });

function setup(share: any, extra: { request?: any; shareAfter?: any } = {}) {
  const tx: any = {
    $queryRaw: jest.fn(async () => undefined),
    cota: { findUniqueOrThrow: jest.fn(async () => share), update: jest.fn(async () => undefined) },
    bolao: { update: jest.fn(async () => undefined) },
    comissao: { updateMany: jest.fn(async () => ({ count: 0 })) },
    usuario: { findMany: jest.fn(async () => [{ id: 'adm1' }, { id: 'adm2' }]) },
    notificacao: { create: jest.fn(async () => undefined), createMany: jest.fn(async () => undefined) },
    pedidoCancelamento: { findFirst: jest.fn(async () => null), create: jest.fn(async (args: any) => ({ id: 'r1', status: 'pendente', ...args.data })), updateMany: jest.fn(async () => ({ count: 1 })) },
    carteiraMovimento: { findUnique: jest.fn(async () => null), create: jest.fn(async () => undefined) },
  };
  const prisma: any = {
    $transaction: (fn: any) => fn(tx),
    cota: { findUnique: jest.fn(async (args: any) => (args.select?.status ? (extra.shareAfter ?? { status: 'cancelada' }) : share)) },
    pedidoCancelamento: { findUnique: jest.fn(async () => extra.request ?? null), findFirst: jest.fn(async () => extra.request ?? null), updateMany: jest.fn(async () => ({ count: 1 })), findMany: jest.fn(async () => []), count: jest.fn(async () => 0) },
  };
  const audit: any = { record: jest.fn(async () => undefined) };
  const config: any = { get: jest.fn((_key: string, fallback: string) => fallback) };
  const service = new PaymentsService(prisma, audit, config);
  return { service, tx, prisma, audit };
}

describe('regras do prazo de cancelamento', () => {
  it('prazo padrão de 7 dias e valor inválido volta ao padrão', () => {
    expect(cancelWindowDays(undefined)).toBe(7);
    expect(cancelWindowDays('abc')).toBe(7);
    expect(cancelWindowDays('0')).toBe(7);
    expect(cancelWindowDays('10')).toBe(10);
  });
  it('reserva sempre pode cancelar; cota paga só dentro do prazo e antes do registro', () => {
    const now = new Date();
    expect(cancellationInfo({ status: 'reservada' as any }, 7, now)).toMatchObject({ tipo: 'reserva', pode: true });
    const recent = cancellationInfo({ status: 'paga' as any, pagamento: { status: 'confirmado' as any, confirmadoEm: new Date(now.getTime() - 2 * day), criadoEm: now } }, 7, now);
    expect(recent).toMatchObject({ tipo: 'pedido', pode: true });
    expect(recent.ate?.getTime()).toBe(now.getTime() - 2 * day + 7 * day);
    expect(cancellationInfo({ status: 'paga' as any, pagamento: { status: 'confirmado' as any, confirmadoEm: new Date(now.getTime() - 8 * day), criadoEm: now } }, 7, now)).toMatchObject({ pode: false });
    expect(cancellationInfo({ status: 'registrada' as any }, 7, now)).toMatchObject({ pode: false });
    expect(cancellationInfo({ status: 'cancelada' as any }, 7, now)).toMatchObject({ pode: false, motivoBloqueio: null });
  });
});

describe('cliente cancela a própria reserva', () => {
  it('cancela, devolve o estoque e registra na auditoria', async () => {
    const { service, tx, audit } = setup({ ...reserved });
    expect(await service.cancelOwnShare('s1', user, { motivo: 'errei' })).toEqual({ cancelada: true });
    expect(tx.bolao.update).toHaveBeenCalledWith({ where: { id: 'b1' }, data: { cotasVendidas: { decrement: 2 } } });
    expect(audit.record).toHaveBeenCalledWith(tx, expect.objectContaining({ evento: 'cota.cancelada_cliente', atorId: 'u1' }));
  });
  it('não cancela cota de outra pessoa', async () => {
    const { service } = setup({ ...reserved, compradorId: 'outro' });
    await expect(service.cancelOwnShare('s1', user)).rejects.toThrow(NotFoundException);
  });
  it.each([['já cancelada', { status: 'cancelada' }], ['já paga', { status: 'paga' }], ['pagamento confirmado', { pagamento: { id: 'p', status: 'confirmado' } }]])('recusa: %s', async (_n, patch) => {
    const { service, tx } = setup({ ...reserved, ...patch });
    await expect(service.cancelOwnShare('s1', user)).rejects.toThrow(ConflictException);
    expect(tx.bolao.update).not.toHaveBeenCalled();
  });
  it('se o pagamento confirma no meio, não diz que cancelou', async () => {
    const { service, prisma } = setup({ ...reserved, pagamento: { id: 'p1', status: 'pendente', pspProvedor: 'cora', pspTransactionId: null } }, { shareAfter: { status: 'paga' } });
    jest.spyOn(service, 'releasePayment').mockResolvedValue({} as any);
    await expect(service.cancelOwnShare('s1', user)).rejects.toThrow('confirmado');
    expect(prisma.cota.findUnique).toHaveBeenCalled();
  });
});

describe('cliente pede o cancelamento de cota paga', () => {
  it('cria o pedido com o valor pago e avisa os administradores', async () => {
    const { service, tx } = setup(paidAt(2));
    expect(await service.requestCancellation('s1', user, { motivo: '  comprei sem querer  ' })).toEqual({ id: 'r1', status: 'pendente' });
    expect(tx.pedidoCancelamento.create).toHaveBeenCalledWith({ data: { cotaId: 's1', usuarioId: 'u1', motivo: 'comprei sem querer', valorCentavos: 500 } });
    expect(tx.notificacao.createMany.mock.calls[0][0].data).toHaveLength(2);
    expect(tx.notificacao.createMany.mock.calls[0][0].data[0]).toMatchObject({ tipo: 'cancelamento.pedido' });
  });
  it('recusa depois do prazo, com a cota registrada, em reserva ou com pedido já aberto', async () => {
    await expect(setup(paidAt(9)).service.requestCancellation('s1', user)).rejects.toThrow('prazo');
    await expect(setup({ ...paidAt(1), status: 'registrada' }).service.requestCancellation('s1', user)).rejects.toThrow('registrada');
    await expect(setup({ ...reserved, bolao: {} }).service.requestCancellation('s1', user)).rejects.toThrow('Cancelar compra');
    const open = setup(paidAt(1));
    open.tx.pedidoCancelamento.findFirst.mockResolvedValue({ id: 'r0' });
    await expect(open.service.requestCancellation('s1', user)).rejects.toThrow('em análise');
  });
  it('o cliente pode retirar o pedido em análise', async () => {
    const { service, prisma } = setup(paidAt(1), { request: { id: 'r1' } });
    expect(await service.withdrawCancellation('s1', user)).toEqual({ retirado: true });
    expect(prisma.pedidoCancelamento.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: 'retirado' }) }));
  });
});

describe('administrador responde ao pedido', () => {
  const request = { id: 'r1', cotaId: 's1', usuarioId: 'u1', status: 'pendente' };
  it('aprovar em carteira estorna a cota e credita o valor uma vez', async () => {
    const { service, tx } = setup(paidAt(2), { request });
    const release = jest.spyOn(service, 'releasePayment').mockResolvedValue({} as any);
    expect(await service.approveCancellation('r1', { devolucao: 'carteira', resposta: 'Tudo certo' }, admin)).toEqual({ estornada: true, devolucao: 'carteira' });
    expect(release).toHaveBeenCalledWith('p1', 'estornado', 'admin');
    expect(tx.carteiraMovimento.create).toHaveBeenCalledWith({ data: expect.objectContaining({ usuarioId: 'u1', tipo: 'credito_reembolso', valorCentavos: 500, chave: 'reembolso_cota:p1' }) });
    expect(tx.pedidoCancelamento.updateMany).toHaveBeenCalledWith({ where: { id: 'r1', status: 'pendente' }, data: expect.objectContaining({ status: 'aprovado', devolucao: 'carteira' }) });
    expect(tx.notificacao.create.mock.calls[0][0].data).toMatchObject({ usuarioId: 'u1', tipo: 'cancelamento.aprovado' });
  });
  it('aprovar em Pix não mexe na carteira', async () => {
    const { service, tx } = setup(paidAt(2), { request });
    jest.spyOn(service, 'releasePayment').mockResolvedValue({} as any);
    expect((await service.approveCancellation('r1', { devolucao: 'pix' }, admin)).devolucao).toBe('pix');
    expect(tx.carteiraMovimento.create).not.toHaveBeenCalled();
  });
  it('cota paga com o saldo do BL volta sempre para o saldo, sem crédito em dobro', async () => {
    const { service, tx } = setup(paidAt(2, { formaBaixa: 'saldo_bl', origem: 'saldo' }), { request });
    jest.spyOn(service, 'releasePayment').mockResolvedValue({} as any);
    expect((await service.approveCancellation('r1', { devolucao: 'pix' }, admin)).devolucao).toBe('carteira');
    expect(tx.carteiraMovimento.create).not.toHaveBeenCalled();
  });
  it('retomar um estorno que parou no meio só conclui o crédito e o pedido', async () => {
    const { service, tx } = setup({ ...paidAt(2, { status: 'estornado' }), status: 'estornada' }, { request });
    const release = jest.spyOn(service, 'releasePayment').mockResolvedValue({} as any);
    await service.approveCancellation('r1', { devolucao: 'carteira' }, admin);
    expect(release).not.toHaveBeenCalled();
    expect(tx.carteiraMovimento.create).toHaveBeenCalledTimes(1);
  });
  it.each([
    ['nota fiscal emitida', paidAt(2, { notaFiscal: { status: 'emitida' } })],
    ['aposta já registrada', { ...paidAt(2), status: 'registrada' }],
    ['reserva sem pagamento', { ...paidAt(2, { status: 'pendente' }) }],
  ])('recusa estornar: %s', async (_n, share) => {
    const { service, tx } = setup(share, { request });
    const release = jest.spyOn(service, 'releasePayment').mockResolvedValue({} as any);
    await expect(service.approveCancellation('r1', { devolucao: 'carteira' }, admin)).rejects.toThrow();
    expect(release).not.toHaveBeenCalled();
    expect(tx.carteiraMovimento.create).not.toHaveBeenCalled();
  });
  it('pedido já respondido não é aprovado de novo', async () => {
    const { service } = setup(paidAt(2), { request: { ...request, status: 'aprovado' } });
    await expect(service.approveCancellation('r1', { devolucao: 'pix' }, admin)).rejects.toThrow('já foi respondido');
  });
  it('recusar guarda a resposta e avisa o cliente', async () => {
    const { service, tx } = setup(paidAt(2), { request: { ...request, cota: { bolao: { concurso: {} } } } });
    expect(await service.rejectCancellation('r1', { resposta: ' Fora do prazo ' }, admin)).toEqual({ recusado: true });
    expect(tx.pedidoCancelamento.updateMany).toHaveBeenCalledWith({ where: { id: 'r1', status: 'pendente' }, data: expect.objectContaining({ status: 'recusado', resposta: 'Fora do prazo' }) });
    expect(tx.notificacao.create.mock.calls[0][0].data).toMatchObject({ tipo: 'cancelamento.recusado' });
  });
  it('o administrador também estorna sem pedido do cliente', async () => {
    const { service, tx } = setup(paidAt(2));
    jest.spyOn(service, 'releasePayment').mockResolvedValue({} as any);
    await service.refundShare('s1', { devolucao: 'carteira' }, admin);
    expect(tx.pedidoCancelamento.updateMany).not.toHaveBeenCalled();
    expect(tx.carteiraMovimento.create).toHaveBeenCalled();
  });
  it('cancelar por aqui uma cota paga no gateway manda usar Estornar', async () => {
    const { service } = setup(paidAt(2));
    await expect(service.cancelShare('s1', {}, admin)).rejects.toThrow('Estornar');
  });
});
