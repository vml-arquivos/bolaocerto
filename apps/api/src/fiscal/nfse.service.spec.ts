import { BadRequestException, ConflictException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, StatusNotaFiscal, StatusPagamento } from '@prisma/client';
import { AuthUser } from '../auth/auth.utils';
import { CoraFiscalClient } from './nfse.client';
import { NfseService, toReceiptAddress } from './nfse.service';

const admin = { id: 'admin-1', papel: 'admin' } as AuthUser;
const FULL_USER = { id: 'u1', email: 'p@x.com', enderecoCep: '70000000', enderecoLogradouro: 'Rua A', enderecoNumero: '10', enderecoComplemento: null, enderecoBairro: 'Centro', enderecoCidade: 'Brasília', enderecoUf: 'DF' };

function config(values: Record<string, string>) {
  return { get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback ?? '') } as unknown as ConfigService;
}

function payment(overrides: Record<string, unknown> = {}, user: Record<string, unknown> = FULL_USER) {
  return { id: 'pay-1', status: StatusPagamento.confirmado, pspProvedor: 'cora', pspTransactionId: 'inv_1', valorBruto: new Prisma.Decimal(100), notaFiscal: null, cota: { comprador: user }, ...overrides };
}

function setup(options: { values?: Record<string, string>; payment?: unknown; fiscal?: Partial<CoraFiscalClient> } = {}) {
  const prisma = {
    pagamento: { findUnique: jest.fn().mockResolvedValue(options.payment ?? payment()), findMany: jest.fn().mockResolvedValue([]), count: jest.fn().mockResolvedValue(0) },
    notaFiscal: {
      upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: 'nota-1', ...create })),
      findUnique: jest.fn().mockResolvedValue({ id: 'nota-1', origem: 'cora', provedorId: 'nfse_abcd1234', status: StatusNotaFiscal.aguardando, pdfUrl: null, xmlUrl: null, numero: null, emitidaEm: null }),
      update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'nota-1', ...data })),
      findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]),
    },
    usuario: { update: jest.fn().mockResolvedValue(FULL_USER), findUniqueOrThrow: jest.fn().mockResolvedValue(FULL_USER), findUnique: jest.fn().mockResolvedValue(FULL_USER) },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const fiscal = { emit: jest.fn().mockResolvedValue({ id: 'nfse_abcd1234', status: 'aguardando' }), get: jest.fn().mockResolvedValue({ id: 'nfse_abcd1234', status: 'emitida', pdf: 'https://x/p.pdf', xml: 'https://x/n.xml', number: '123' }), cancel: jest.fn().mockResolvedValue(undefined), ...options.fiscal } as unknown as CoraFiscalClient;
  const payments = { coraProvider: jest.fn().mockReturnValue({}) };
  const values = { NFSE_MODE: 'manual', NFSE_ISS_PCT: '5', NFSE_SERVICE_CODE: '1709', ...options.values };
  const service = new NfseService(prisma as never, audit as never, config(values), payments as never, fiscal);
  return { service, prisma, audit, fiscal, payments };
}

describe('toReceiptAddress', () => {
  it('lista o que falta no endereço', () => {
    expect(toReceiptAddress({ ...FULL_USER, enderecoCep: null, enderecoBairro: '' }).missing).toEqual(['bairro', 'CEP']);
    expect(toReceiptAddress(FULL_USER).address).toEqual({ street: 'Rua A', number: '10', district: 'Centro', city: 'Brasília', state: 'DF', zip_code: '70000000', complement: undefined });
  });
});

describe('NfseService — emissão', () => {
  it('não emite com NFSE_MODE=off', async () => {
    const { service, fiscal } = setup({ values: { NFSE_MODE: 'off' } });
    await expect(service.emitForPayment('pay-1', admin)).rejects.toThrow(BadRequestException);
    expect(fiscal.emit).not.toHaveBeenCalled();
  });

  it('exige alíquota de ISS configurada (não inventa valor fiscal)', async () => {
    const { service } = setup({ values: { NFSE_ISS_PCT: '' } });
    await expect(service.emitForPayment('pay-1', admin)).rejects.toThrow(/NFSE_ISS_PCT/);
  });

  it('só emite para pagamento confirmado da Cora', async () => {
    await expect(setup({ payment: payment({ status: StatusPagamento.pendente }) }).service.emitForPayment('pay-1', admin)).rejects.toThrow(ConflictException);
    await expect(setup({ payment: payment({ pspProvedor: 'manual', pspTransactionId: null }) }).service.emitForPayment('pay-1', admin)).rejects.toThrow(/Registrar nota manual/);
  });

  it('bloqueia endereço incompleto sem chamar a Cora', async () => {
    const { service, fiscal } = setup({ payment: payment({}, { ...FULL_USER, enderecoCep: null }) });
    await expect(service.emitForPayment('pay-1', admin)).rejects.toThrow(/Endereço do participante incompleto/);
    expect(fiscal.emit).not.toHaveBeenCalled();
  });

  it('bloqueia segunda nota ativa para o mesmo pagamento, mas permite refazer após erro', async () => {
    const active = setup({ payment: payment({ notaFiscal: { id: 'n', status: StatusNotaFiscal.emitida } }) });
    await expect(active.service.emitForPayment('pay-1', admin)).rejects.toThrow(ConflictException);
    const failed = setup({ payment: payment({ notaFiscal: { id: 'n', status: StatusNotaFiscal.erro } }) });
    await failed.service.emitForPayment('pay-1', admin);
    expect(failed.fiscal.emit).toHaveBeenCalledTimes(1);
  });

  it('emite, grava a nota vinculada ao pagamento, consulta o status e audita', async () => {
    const { service, fiscal, prisma, audit } = setup();
    const note = await service.emitForPayment('pay-1', admin);
    expect(fiscal.emit).toHaveBeenCalledWith(expect.objectContaining({ chargeId: 'inv_1', email: 'p@x.com', issPct: 5, serviceCode: '1709' }), 'nfse-pay-1');
    expect(prisma.notaFiscal.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ pagamentoId: 'pay-1', provedorId: 'nfse_abcd1234', origem: 'cora' }) }));
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ evento: 'nfse.solicitada' }));
    expect(note).toEqual(expect.objectContaining({ status: 'emitida', numero: '123', pdfUrl: 'https://x/p.pdf' }));
  });

  it('recusa da Cora (422) fica registrada como erro para o painel; falha de rede não cria registro', async () => {
    const refused = setup({ fiscal: { emit: jest.fn().mockRejectedValue(new BadRequestException('A Cora recusou emitir a NFS-e (HTTP 422).')) } });
    await expect(refused.service.emitForPayment('pay-1', admin)).rejects.toThrow(BadRequestException);
    expect(refused.prisma.notaFiscal.upsert).toHaveBeenCalledWith(expect.objectContaining({ create: expect.objectContaining({ status: StatusNotaFiscal.erro }) }));
    const down = setup({ fiscal: { emit: jest.fn().mockRejectedValue(new Error('timeout')) } });
    await expect(down.service.emitForPayment('pay-1', admin)).rejects.toThrow('timeout');
    expect(down.prisma.notaFiscal.upsert).not.toHaveBeenCalled();
  });

  it('salva o endereço informado pelo admin antes de emitir', async () => {
    const { service, prisma } = setup();
    await service.emitForPayment('pay-1', admin, { cep: '70000000', logradouro: 'Rua A', numero: '10', bairro: 'Centro', cidade: 'Brasília', uf: 'DF' });
    expect(prisma.usuario.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'u1' } }));
  });
});

describe('NfseService — rotinas e operação manual', () => {
  it('modo automático só roda com NFSE_MODE=auto', async () => {
    const manual = setup();
    expect(await manual.service.autoEmit()).toEqual({ candidatos: 0, emitidas: 0, erros: 0 });
    expect(manual.prisma.pagamento.findMany).not.toHaveBeenCalled();
  });

  it('modo automático emite os candidatos e segue em frente se um falhar', async () => {
    const { service, prisma, fiscal } = setup({ values: { NFSE_MODE: 'auto' } });
    prisma.pagamento.findMany.mockResolvedValue([{ id: 'pay-1' }, { id: 'pay-2' }]);
    prisma.pagamento.findUnique.mockResolvedValueOnce(payment()).mockResolvedValueOnce(payment({ id: 'pay-2', status: StatusPagamento.pendente }));
    const result = await service.autoEmit();
    expect(result).toEqual({ candidatos: 2, emitidas: 1, erros: 1 });
    expect(fiscal.emit).toHaveBeenCalledTimes(1);
  });

  it('registra nota manual (balcão/app da Cora) como emitida e audita', async () => {
    const { service, audit } = setup({ payment: payment({ pspProvedor: 'manual', pspTransactionId: null }) });
    const note = await service.registerManual('pay-1', { numero: '99', pdfUrl: 'https://x/n.pdf' }, admin);
    expect(note).toEqual(expect.objectContaining({ status: StatusNotaFiscal.emitida, origem: 'manual', numero: '99' }));
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ evento: 'nfse.registrada_manual' }));
  });

  it('cancela na Cora e marca como cancelada; falha da Cora mantém a nota ativa', async () => {
    const ok = setup();
    await ok.service.cancel('nota-1', { motivo: 'Venda estornada' }, admin);
    expect(ok.fiscal.cancel).toHaveBeenCalledWith('nfse_abcd1234');
    expect(ok.prisma.notaFiscal.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: StatusNotaFiscal.cancelada }) }));
    const fail = setup({ fiscal: { cancel: jest.fn().mockRejectedValue(new Error('cidade exige portal')) } });
    await expect(fail.service.cancel('nota-1', { motivo: 'Venda estornada' }, admin)).rejects.toThrow('cidade exige portal');
    expect(fail.prisma.notaFiscal.update).not.toHaveBeenCalled();
  });
});
