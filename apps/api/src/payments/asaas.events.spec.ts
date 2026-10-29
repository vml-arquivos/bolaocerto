import { AsaasProvider } from './payment.provider';
const provider = new AsaasProvider({ get: (key: string, fallback: string) => key === 'PAYMENT_WEBHOOK_SECRET' ? 'secret' : fallback } as never);
const headers = { 'asaas-access-token': 'secret' };
describe('Asaas lifecycle events', () => {
  it.each(['PAYMENT_CREATED','PAYMENT_UPDATED','PAYMENT_OVERDUE','PAYMENT_CHECKOUT_VIEWED','UNKNOWN'])('ignores non-final event %s', async event => {
    await expect(provider.resolveWebhook(JSON.stringify({ event, payment: { id: 'pay_1' } }), headers)).resolves.toBeNull();
  });
  it('requires authentication', async () => {
    await expect(provider.resolveWebhook('{}', {})).rejects.toThrow();
  });
  it('passes the paid gross amount for validation', async () => {
    await expect(provider.resolveWebhook(JSON.stringify({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1', value: 10 } }), headers)).resolves.toEqual({ transactionId: 'pay_1', status: 'confirmed', paidAmount: 10 });
  });
  it('rejects confirmed webhook without amount', async () => {
    await expect(provider.resolveWebhook(JSON.stringify({ event: 'PAYMENT_RECEIVED', payment: { id: 'pay_1' } }), headers)).rejects.toThrow();
  });
});
