import 'dotenv/config';
import * as net from 'node:net';
import { ConfigService } from '@nestjs/config';
import { MailService } from '../common/mail.service';

/** Testa o e-mail direto no servidor da API, sem precisar entrar no painel. Uso: node dist/tools/test-email.js voce@exemplo.com */
function probe(host: string, port: number): Promise<{ ok: boolean; detalhe: string }> {
  return new Promise((resolve) => {
    const socket = net.connect({ host, port, timeout: 8000 });
    socket.once('connect', () => { socket.destroy(); resolve({ ok: true, detalhe: 'conectou' }); });
    socket.once('timeout', () => { socket.destroy(); resolve({ ok: false, detalhe: 'sem resposta em 8 segundos (porta provavelmente bloqueada pelo servidor)' }); });
    socket.once('error', (error: NodeJS.ErrnoException) => resolve({ ok: false, detalhe: error.code ?? error.message }));
  });
}

async function main() {
  const to = process.argv[2];
  const mail = new MailService(new ConfigService());
  const info = mail.describe();
  console.log('--- Configuração lida pelo servidor (a senha nunca aparece) ---');
  console.log(`Servidor: ${info.servidor ?? 'NÃO PREENCHIDO (SMTP_HOST)'}`);
  console.log(`Porta: ${info.porta} | Seguro (SMTP_SECURE): ${info.seguro}`);
  console.log(`Usuário: ${info.usuario ?? 'NÃO PREENCHIDO (SMTP_USER)'} | Senha preenchida: ${info.temSenha ? 'sim' : 'NÃO (SMTP_PASS ou SMTP_PASSWORD)'}`);
  console.log(`Remetente (MAIL_FROM ou SMTP_FROM_EMAIL): ${info.remetente ?? 'NÃO PREENCHIDO'}`);
  console.log(`Endereço do site nos links: ${info.enderecoDoSite}`);
  if (!info.configurado || !info.servidor) {
    console.log('\nRESULTADO: o e-mail NÃO está ligado neste servidor. Preencha SMTP_HOST e as outras variáveis no Coolify, salve e faça Redeploy da API.');
    process.exitCode = 1;
    return;
  }
  console.log('\n--- Conexão com o servidor de e-mail ---');
  const ports = [...new Set([info.porta, 587, 2525, 465])];
  const results: Record<number, boolean> = {};
  for (const port of ports) {
    const result = await probe(info.servidor, port);
    results[port] = result.ok;
    console.log(`Porta ${port}: ${result.ok ? 'OK' : 'FALHOU'} (${result.detalhe})`);
  }
  if (!results[info.porta]) {
    const alternative = [587, 2525, 465].find((port) => port !== info.porta && results[port]);
    console.log(`\nRESULTADO: a porta ${info.porta} não conecta a partir deste servidor.${alternative ? ` A porta ${alternative} funciona: coloque SMTP_PORT=${alternative}${alternative === 465 ? ' e SMTP_SECURE=true' : ' e SMTP_SECURE=false'}, salve e faça Redeploy.` : ' Nenhuma porta de e-mail abriu: o provedor do servidor (ex.: DigitalOcean) está bloqueando saída de e-mail. Peça o desbloqueio ao suporte deles ou use outro serviço por API.'}`);
    process.exitCode = 1;
    return;
  }
  if (!to) { console.log('\nConexão OK. Para enviar um e-mail de teste: node dist/tools/test-email.js seuemail@exemplo.com'); return; }
  console.log(`\n--- Enviando e-mail de teste para ${to} ---`);
  const result = await mail.sendTest(to);
  console.log(`${result.ok ? 'RESULTADO: ENVIADO.' : 'RESULTADO: FALHOU.'} ${result.detalhe}`);
  if (!result.ok) process.exitCode = 1;
}
main().catch((error) => { console.error('Falha ao testar:', error instanceof Error ? error.message : error); process.exitCode = 1; });
