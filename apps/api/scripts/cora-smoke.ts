/**
 * Teste de fumaça da integração com a Cora (use em HOMOLOGAÇÃO: CORA_ENV=stage).
 * Fluxo: autentica (mTLS) -> cria cobrança Pix de R$ 5,00 -> consulta -> cancela.
 *
 * Uso (na raiz do repositório, com as variáveis CORA_* exportadas):
 *   pnpm --filter @bolaocerto/api cora:smoke
 */
import 'dotenv/config';
import { randomUUID } from 'node:crypto';
import { ConfigService } from '@nestjs/config';
import { CoraProvider } from '../src/payments/payment.provider';

async function main() {
  const config = new ConfigService(process.env as Record<string, string>);
  const environment = config.get<string>('CORA_ENV', 'stage');
  if (environment === 'production' && process.env.CORA_SMOKE_ALLOW_PRODUCTION !== 'yes') {
    throw new Error('Este teste cria uma cobrança real. Em produção, defina CORA_SMOKE_ALLOW_PRODUCTION=yes.');
  }
  const provider = new CoraProvider(config);
  const due = new Date(Date.now() + 86_400_000).toISOString().slice(0, 10);
  console.log(`Ambiente: ${environment}`);

  const pix = await provider.createCharge({ externalReference: randomUUID(), method: 'pix', value: 5, dueDate: due, customerName: 'Teste BL', customerCpf: process.env.CORA_SMOKE_CPF ?? '12345678909', customerEmail: 'teste@bolaolivre.local', description: 'Teste de integração BL' });
  console.log('Pix criado:', { id: pix.transactionId, status: pix.status, copiaECola: pix.qrCode?.slice(0, 40) + '…', qrCodeUrl: pix.qrCodeUrl });

  const boleto = await provider.createCharge({ externalReference: randomUUID(), method: 'boleto', value: 5, dueDate: due, customerName: 'Teste BL', customerCpf: process.env.CORA_SMOKE_CPF ?? '12345678909', customerEmail: 'teste@bolaolivre.local', description: 'Teste de integração BL' });
  console.log('Boleto criado:', { id: boleto.transactionId, status: boleto.status, linhaDigitavel: boleto.boleto?.digitableLine, url: boleto.boleto?.url, pixNoBoleto: Boolean(boleto.qrCode) });

  for (const charge of [pix, boleto]) {
    console.log('Consulta:', charge.transactionId, await provider.fetchStatus(charge.transactionId));
    await provider.cancelCharge(charge.transactionId);
    console.log('Cancelada:', charge.transactionId, await provider.fetchStatus(charge.transactionId));
  }
  console.log('OK — autenticação mTLS, emissão, consulta e cancelamento funcionando.');
}

main().catch((error) => { console.error('FALHA:', error instanceof Error ? error.message : error); process.exit(1); });
