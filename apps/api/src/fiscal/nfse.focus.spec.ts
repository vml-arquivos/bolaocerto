import { BadRequestException, ConflictException, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, StatusNotaFiscal, StatusPagamento } from '@prisma/client';
import { AuthUser } from '../auth/auth.utils';
import { FocusNfseClient, brazilStamp, buildFocusBody, defaultMunicipalCode, defaultNbs, explainFocusError, mapFocusStatus } from './nfse.focus';
import { NfseService } from './nfse.service';

const admin = { id: 'admin-1', papel: 'admin' } as AuthUser;
const issuer = { cnpj: '11222333000181', inscricaoMunicipal: '1234567', codigoMunicipio: '5300108', codigoTributacaoNacional: '170901', opcaoSimples: 3, percentualTributos: 0 };
const tomador = { cpf: '11144477735', nome: 'Maria da Silva', email: 'm@x.com', telefone: '61999998888', endereco: null };

describe('buildFocusBody', () => {
  it('envia só o valor do serviço e os dados de Brasília/DF', () => {
    const body = buildFocusBody({ issuer, tomador, valor: 23.66, descricao: 'Administração de bolão', agora: new Date('2026-11-05T13:30:00Z') });
    expect(body.valor_servico).toBe(23.66);
    expect(body.codigo_municipio_emissora).toBe(5300108);
    expect(body.cnpj_prestador).toBe('11222333000181');
    expect(body.cpf_tomador).toBe('11144477735');
    expect(body.codigo_opcao_simples_nacional).toBe(3);
    expect(body.regime_tributario_simples_nacional).toBe('1');
    expect(body.data_emissao).toBe('2026-11-05T10:30:00-0300');
    expect(body.data_competencia).toBe('2026-11-05');
    expect(body).not.toHaveProperty('logradouro_tomador');
    expect(body).not.toHaveProperty('codigo_nbs');
    // Sem indicador da operação, o grupo IBS/CBS não vai (o fisco recusa indDest sem cIndOp).
    expect(body).not.toHaveProperty('indicador_destinatario');
    expect(body).not.toHaveProperty('finalidade_emissao');
    expect(body).not.toHaveProperty('consumidor_final');
  });

  it('manda o grupo IBS/CBS completo quando o indicador da operação está configurado', () => {
    const body = buildFocusBody({ issuer: { ...issuer, nbs: '114062000', indicadorOperacao: '100301', ibsCbsSituacao: '000', ibsCbsClassificacao: '000001' }, tomador, valor: 10, descricao: 'x' });
    expect(body).toMatchObject({ codigo_nbs: '114062000', codigo_indicador_operacao: '100301', ibs_cbs_situacao_tributaria: '000', ibs_cbs_classificacao_tributaria: '000001', finalidade_emissao: 0, consumidor_final: 1, indicador_destinatario: 0 });
  });

  it('Brasília usa os 4 primeiros dígitos do código nacional como código municipal', () => {
    expect(defaultMunicipalCode('5300108', '100801')).toBe('1008');
    expect(defaultMunicipalCode('3550308', '100801')).toBeUndefined();
    expect(defaultMunicipalCode('5300108', '')).toBeUndefined();
  });

  it('item 19.01 (loteria) preenche o NBS sozinho; outros itens não', () => {
    expect(defaultNbs('190101')).toBe('109051100');
    expect(defaultNbs('170901')).toBeUndefined();
    expect(defaultMunicipalCode('5300108', '190101')).toBe('1901');
  });

  it('explica em português o que falta quando o fisco recusa o XML', () => {
    const raw = "Element 'xDescServ': This element is not expected. Expected is ( cTribMun ). Element 'indDest': Expected is ( cIndOp ).";
    expect(explainFocusError(raw)).toMatch(/tributação municipal/);
    expect(explainFocusError(raw)).toMatch(/reforma tributária/);
    expect(explainFocusError('qualquer outra coisa')).toBe('');
  });

  it('inclui o endereço do tomador e os campos da reforma só quando existem', () => {
    const body = buildFocusBody({
      issuer: { ...issuer, nbs: '114062000', indicadorOperacao: '100301', ibsCbsSituacao: '000' },
      tomador: { ...tomador, endereco: { cep: '70000000', logradouro: 'Rua A', numero: '10', bairro: 'Centro', codigoMunicipio: '5300108' } },
      valor: 10, descricao: 'x',
    });
    expect(body).toMatchObject({ logradouro_tomador: 'Rua A', codigo_municipio_tomador: 5300108, codigo_nbs: '114062000', ibs_cbs_situacao_tributaria: '000' });
  });

  it('arredonda para centavos e usa o horário de Brasília na virada do dia', () => {
    expect(buildFocusBody({ issuer, tomador, valor: 10.005 + 0.0001, descricao: 'x' }).valor_servico).toBe(10.01);
    expect(brazilStamp(new Date('2026-11-06T01:30:00Z')).competencia).toBe('2026-11-05');
  });
});

describe('mapFocusStatus', () => {
  it('traduz os estados da Focus', () => {
    expect(mapFocusStatus('autorizado')).toBe('emitida');
    expect(mapFocusStatus('erro_autorizacao')).toBe('erro');
    expect(mapFocusStatus('cancelado')).toBe('cancelada');
    expect(mapFocusStatus('processando_autorizacao')).toBe('aguardando');
  });
});

describe('FocusNfseClient', () => {
  it('emite, consulta e lê os erros do fisco', async () => {
    const http = jest.fn()
      .mockResolvedValueOnce({ status: 202, body: JSON.stringify({ status: 'processando_autorizacao' }) })
      .mockResolvedValueOnce({ status: 200, body: JSON.stringify({ status: 'autorizado', numero: '77', url: 'https://x/n.pdf', caminho_xml_nota_fiscal: 'https://x/n.xml' }) })
      .mockResolvedValueOnce({ status: 200, body: JSON.stringify({ status: 'erro_autorizacao', erros: [{ mensagem: 'Inscrição municipal inválida' }] }) });
    const client = new FocusNfseClient(http);
    expect((await client.emit('bl-pay-123456', { issuer, tomador, valor: 5, descricao: 'x' })).status).toBe('aguardando');
    expect(http.mock.calls[0]![1]).toBe('/v2/nfsen?ref=bl-pay-123456');
    expect(await client.get('bl-pay-123456')).toMatchObject({ status: 'emitida', numero: '77', pdf: 'https://x/n.pdf', xml: 'https://x/n.xml' });
    expect(await client.get('bl-pay-123456')).toMatchObject({ status: 'erro', erro: expect.stringContaining('Inscrição municipal inválida') });
  });

  it('separa erro de dados (corrigir) de erro de token e de indisponibilidade', async () => {
    const run = (status: number) => new FocusNfseClient(jest.fn().mockResolvedValue({ status, body: '{"mensagem":"x"}' })).emit('bl-pay-123456', { issuer, tomador, valor: 5, descricao: 'x' });
    await expect(run(422)).rejects.toThrow(BadRequestException);
    await expect(run(401)).rejects.toThrow(/token/);
    await expect(run(503)).rejects.toThrow(ServiceUnavailableException);
  });

  it('cancelamento exige motivo de 15 caracteres', async () => {
    const http = jest.fn().mockResolvedValue({ status: 200, body: '{}' });
    const client = new FocusNfseClient(http);
    await expect(client.cancel('bl-pay-123456', 'curto')).rejects.toThrow(/15 caracteres/);
    await client.cancel('bl-pay-123456', 'Cobrança duplicada, nota emitida por engano');
    expect(http).toHaveBeenCalledWith('DELETE', '/v2/nfsen/bl-pay-123456', { justificativa: 'Cobrança duplicada, nota emitida por engano' });
  });
});

function config(values: Record<string, string>) {
  return { get: jest.fn((key: string, fallback?: string) => values[key] ?? fallback ?? '') } as unknown as ConfigService;
}
const BUYER = { id: 'u1', nome: 'Maria da Silva', cpf: '11144477735', telefone: '61999998888', email: 'm@x.com', enderecoCep: null, enderecoLogradouro: null, enderecoNumero: null, enderecoComplemento: null, enderecoBairro: null, enderecoCidade: null, enderecoUf: null };
const payment = (overrides: Record<string, unknown> = {}) => ({ id: '0f0f0f0f-1111-2222-3333-444444444444', status: StatusPagamento.confirmado, pspProvedor: 'mercadopago', pspTransactionId: 'mp_1', valorBruto: new Prisma.Decimal(100), valorTaxaAdmin: new Prisma.Decimal(10), notaFiscal: null, cota: { comprador: BUYER }, ...overrides });

function setup(options: { values?: Record<string, string>; payment?: unknown; candidates?: unknown[]; focus?: Partial<FocusNfseClient> } = {}) {
  const prisma = {
    pagamento: { findUnique: jest.fn().mockResolvedValue(options.payment ?? payment()), findMany: jest.fn().mockResolvedValue(options.candidates ?? []), count: jest.fn().mockResolvedValue(0), aggregate: jest.fn().mockResolvedValue({ _sum: {} }) },
    notaFiscal: {
      upsert: jest.fn().mockImplementation(({ create }) => Promise.resolve({ id: 'nota-1', ...create })),
      findUnique: jest.fn(), update: jest.fn().mockImplementation(({ data }) => Promise.resolve({ id: 'nota-1', ...data })),
      findMany: jest.fn().mockResolvedValue([]), groupBy: jest.fn().mockResolvedValue([]),
    },
    usuario: { update: jest.fn(), findUniqueOrThrow: jest.fn().mockResolvedValue(BUYER), findUnique: jest.fn() },
  };
  const audit = { record: jest.fn().mockResolvedValue(undefined) };
  const focus = { emit: jest.fn().mockResolvedValue({ status: 'aguardando', numero: null, pdf: null, xml: null, erro: null }), get: jest.fn(), cancel: jest.fn(), ...options.focus };
  const values = { NFSE_MODE: 'auto', NFSE_PROVIDER: 'focus', NFSE_CNPJ: '11222333000181', NFSE_MUNICIPAL_REGISTER: '1234567', NFSE_TRIB_NACIONAL: '170901', ...options.values };
  const service = new NfseService(prisma as never, audit as never, config(values), { coraProvider: jest.fn().mockReturnValue(null) } as never, undefined, focus as never);
  return { service, prisma, focus };
}

describe('NfseService com a Focus NFe', () => {
  it('emite só pela taxa de administração, para pagamento de qualquer origem e sem endereço', async () => {
    const { service, focus, prisma } = setup();
    const note = await service.emitForPayment('p', admin);
    const input = (focus.emit as jest.Mock).mock.calls[0]![1];
    expect(input.valor).toBe(10);
    expect(input.tomador).toMatchObject({ cpf: '11144477735', nome: 'Maria da Silva', endereco: null });
    expect(note.origem).toBe('focus');
    expect(Number(note.valor)).toBe(10);
    expect(prisma.notaFiscal.upsert).toHaveBeenCalledTimes(1);
  });

  it('não emite sem taxa de administração (só custo dos jogos)', async () => {
    const { service, focus } = setup({ payment: payment({ valorTaxaAdmin: new Prisma.Decimal(0) }) });
    await expect(service.emitForPayment('p', admin)).rejects.toThrow(ConflictException);
    expect(focus.emit).not.toHaveBeenCalled();
  });

  it('diz exatamente o que falta configurar', async () => {
    const { service, focus } = setup({ values: { NFSE_CNPJ: '', LEGAL_OPERATOR_CNPJ: '', NFSE_TRIB_NACIONAL: '' } });
    await expect(service.emitForPayment('p', admin)).rejects.toThrow(/NFSE_CNPJ, NFSE_TRIB_NACIONAL/);
    expect(focus.emit).not.toHaveBeenCalled();
  });

  it('recusa do fisco vira nota com erro visível e permite refazer com a mesma referência', async () => {
    const failing = setup({ focus: { emit: jest.fn().mockRejectedValue(new BadRequestException('Inscrição municipal inválida')) } });
    await expect(failing.service.emitForPayment('p', admin)).rejects.toThrow(/Inscrição/);
    expect(failing.prisma.notaFiscal.upsert.mock.calls[0]![0].create).toMatchObject({ status: StatusNotaFiscal.erro, origem: 'focus' });
    const retry = setup({ payment: payment({ notaFiscal: { id: 'n', status: StatusNotaFiscal.erro, provedorId: 'bl-antiga-123' } }) });
    await retry.service.emitForPayment('p', admin);
    expect((retry.focus.emit as jest.Mock).mock.calls[0]![0]).toBe('bl-antiga-123');
  });

  it('o modo automático pega todo pagamento confirmado com taxa, sem exigir Cora', async () => {
    const { service, prisma } = setup({ candidates: [{ id: 'p1' }] });
    const result = await service.autoEmit();
    expect(result).toMatchObject({ candidatos: 1, emitidas: 1 });
    const where = prisma.pagamento.findMany.mock.calls[0]![0].where;
    expect(where.valorTaxaAdmin).toBeDefined();
    expect(where).not.toHaveProperty('pspProvedor');
  });

  it('atualiza a nota pelo status da Focus e cancela só nota emitida', async () => {
    const { service, prisma, focus } = setup({ focus: { get: jest.fn().mockResolvedValue({ status: 'emitida', numero: '9', pdf: 'https://x/p.pdf', xml: null, erro: null }) } });
    prisma.notaFiscal.findUnique.mockResolvedValue({ id: 'nota-1', origem: 'focus', provedorId: 'bl-ref-123', status: StatusNotaFiscal.aguardando, pdfUrl: null, xmlUrl: null, numero: null, emitidaEm: null, canceladaEm: null });
    expect(await service.refresh('nota-1')).toMatchObject({ status: 'emitida', numero: '9', pdfUrl: 'https://x/p.pdf' });
    prisma.notaFiscal.findUnique.mockResolvedValue({ id: 'nota-1', origem: 'focus', provedorId: 'bl-ref-123', status: StatusNotaFiscal.emitida });
    await service.cancel('nota-1', { motivo: 'Cobrança duplicada, nota emitida por engano' }, admin);
    expect(focus.cancel).toHaveBeenCalledWith('bl-ref-123', 'Cobrança duplicada, nota emitida por engano');
  });

  it('a configuração informa provedor, ambiente e pendências', async () => {
    const ready = await setup({ values: { NFSE_FOCUS_ENV: 'producao' } }).service.settings();
    expect(ready).toMatchObject({ provedor: 'focus', ambiente: 'producao', pronto: true, faltando: [] });
    const pending = await setup({ values: { NFSE_MUNICIPAL_REGISTER: '' } }).service.settings();
    expect(pending).toMatchObject({ pronto: false, faltando: ['NFSE_MUNICIPAL_REGISTER'] });
  });
});
