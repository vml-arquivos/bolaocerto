import { BadRequestException, ServiceUnavailableException } from '@nestjs/common';
import { buildReceiptBody, CoraFiscalClient, FiscalHttp, mapReceiptStatus } from './nfse.client';

const address = { street: 'Rua A', number: '10', district: 'Centro', city: 'Brasília', state: 'DF', zip_code: '70000000' };

function client(responses: Array<{ status: number; body: string }>) {
  const http = jest.fn<ReturnType<FiscalHttp>, Parameters<FiscalHttp>>();
  for (const response of responses) http.mockResolvedValueOnce(response);
  return { fiscal: new CoraFiscalClient(http), http };
}

describe('NFS-e Cora — corpo e status', () => {
  it('monta o corpo conforme a referência (receivable INVOICE, tipo NFSE, ISS em centésimos)', () => {
    const body = buildReceiptBody({ chargeId: 'inv_abc', email: 'a@b.com', address: { ...address, complement: 'Sala 2' }, issPct: 2.5, description: 'Serviço', serviceCode: '1709', cnae: '6209100 - Suporte' });
    expect(body).toEqual({
      receivable: { id: 'inv_abc', type: 'INVOICE' },
      fiscal_receipt: {
        type: 'NFSE', cnae: '6209100 - Suporte', service_code: '1709', description: 'Serviço',
        customer: { email: 'a@b.com', address: { ...address, complement: 'Sala 2' } },
        tax: { iss: { value: '250' } },
      },
    });
  });

  it('5% vira "500" e a retenção só é enviada quando configurada', () => {
    const base = { chargeId: 'inv_1', email: 'a@b.com', address, issPct: 5 };
    expect(buildReceiptBody(base).fiscal_receipt.tax.iss).toEqual({ value: '500' });
    expect(buildReceiptBody({ ...base, issWithheld: false }).fiscal_receipt.tax.iss).toEqual({ value: '500', withheld: 'false' });
  });

  it('mapeia os status da Cora', () => {
    expect(mapReceiptStatus('COMPLETED')).toBe('emitida');
    expect(mapReceiptStatus('WAITING_TRIGGER')).toBe('aguardando');
    expect(mapReceiptStatus('WAITING_CERTIFICATE')).toBe('aguardando_certificado');
    expect(mapReceiptStatus('ERROR')).toBe('erro');
    expect(mapReceiptStatus(undefined)).toBe('aguardando');
  });
});

describe('NFS-e Cora — chamadas', () => {
  it('emite em POST /fiscal-receipts/service-receipt com idempotência e devolve o id', async () => {
    const { fiscal, http } = client([{ status: 201, body: JSON.stringify({ id: 'nfse_g6Vm03d4S3qeDfZEB6gN1Q', status: 'WAITING_TRIGGER' }) }]);
    const created = await fiscal.emit({ chargeId: 'inv_1', email: 'a@b.com', address, issPct: 5 }, 'key-1');
    expect(created).toEqual({ id: 'nfse_g6Vm03d4S3qeDfZEB6gN1Q', status: 'aguardando' });
    expect(http).toHaveBeenCalledWith('POST', '/fiscal-receipts/service-receipt', expect.objectContaining({ receivable: { id: 'inv_1', type: 'INVOICE' } }), 'key-1');
  });

  it('422 da Cora vira erro de validação com a mensagem; 500 vira indisponibilidade', async () => {
    const a = client([{ status: 422, body: '{"message":"já existe nota para esta cobrança"}' }]);
    await expect(a.fiscal.emit({ chargeId: 'inv_1', email: 'a@b.com', address, issPct: 5 }, 'k')).rejects.toThrow(BadRequestException);
    const b = client([{ status: 500, body: 'erro' }]);
    await expect(b.fiscal.emit({ chargeId: 'inv_1', email: 'a@b.com', address, issPct: 5 }, 'k')).rejects.toThrow(ServiceUnavailableException);
  });

  it('exige id na resposta da emissão', async () => {
    const { fiscal } = client([{ status: 201, body: '{}' }]);
    await expect(fiscal.emit({ chargeId: 'inv_1', email: 'a@b.com', address, issPct: 5 }, 'k')).rejects.toThrow(ServiceUnavailableException);
  });

  it('consulta usa o caminho da referência e cai no caminho alternativo em 404', async () => {
    const { fiscal, http } = client([{ status: 404, body: '' }, { status: 200, body: JSON.stringify({ status: 'COMPLETED', pdf: 'https://x/p.pdf', xml: 'https://x/n.xml' }) }]);
    const info = await fiscal.get('nfse_abcd1234');
    expect(info).toEqual({ id: 'nfse_abcd1234', status: 'emitida', pdf: 'https://x/p.pdf', xml: 'https://x/n.xml', number: null });
    expect(http).toHaveBeenNthCalledWith(1, 'GET', '/fiscal-receipt-api/service-receipt/nfse_abcd1234');
    expect(http).toHaveBeenNthCalledWith(2, 'GET', '/fiscal-receipts/service-receipt/nfse_abcd1234');
  });

  it('rejeita identificadores com caracteres de caminho (sem injeção na URL)', async () => {
    const { fiscal, http } = client([]);
    await expect(fiscal.get('../token')).rejects.toThrow(BadRequestException);
    await expect(fiscal.cancel('a/b')).rejects.toThrow(BadRequestException);
    expect(http).not.toHaveBeenCalled();
  });

  it('cadastra o emissor com os nomes de campo da referência', async () => {
    const { fiscal, http } = client([{ status: 201, body: '{}' }]);
    await fiscal.registerIssuer({ municipalRegister: '123', taxRegime: 'SIMPLES_NACIONAL', specialTaxRegime: 'NONE', rpsSerial: '1', rpsLastNumber: '1' });
    expect(http).toHaveBeenCalledWith('POST', '/fiscal-receipts/issuer', { municipal_register: '123', tax_regime: 'SIMPLES_NACIONAL', special_tax_regime: 'NONE', rps: { last_number: '1', serial: '1' } });
  });

  it('cancela com DELETE no recurso da nota', async () => {
    const { fiscal, http } = client([{ status: 200, body: '' }]);
    await fiscal.cancel('nfse_abcd1234');
    expect(http).toHaveBeenCalledWith('DELETE', '/fiscal-receipts/service-receipt/nfse_abcd1234');
  });
});
