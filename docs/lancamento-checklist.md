# Checklist de lançamento, segurança e operação

Este documento reúne o que precisa estar decidido e configurado antes de abrir o BL — Bolão Livre ao público.

## 1. Jurídico (bloqueante — o código não resolve isso)

- Obter **parecer de advogado especialista em loterias/jogos** sobre o modelo (`mandato` x `loterica_parceira`): intermediar apostas e cobrar taxa de administração pode exigir autorização, e cobrar sobre prêmio é sensível.
- Definir quem é a **pessoa jurídica responsável**, CNAE e tratamento tributário (a NFS-e cobre apenas a taxa de serviço).
- Validar os **Termos de uso**, a **Política de privacidade** e a página **Jogo responsável** com o advogado.
- Confirmar com a lotérica parceira quem registra o bilhete e como o comprovante é entregue.

## 2. Variáveis de ambiente obrigatórias em produção

| Variável | Para quê |
| --- | --- |
| `JWT_SECRET`, `JWT_REFRESH_SECRET` | Assinatura das sessões. **Troque** qualquer valor que já tenha vazado. |
| `TOTP_ENC_KEY` | Chave (32 bytes em base64/hex) que cifra os segredos de 2FA no banco. Sem ela o segredo fica em texto (`plain:`). **Defina antes de ativar 2FA** e não a perca. |
| `ALERT_WEBHOOK_URL` | Slack/Discord que recebe alertas (falha na CAIXA, pago sem registro, 5xx, bolão premiado). |
| `SMTP_*`, `MAIL_FROM`, `APP_PUBLIC_URL` | E-mail de recuperação de senha e avisos. |
| `LOGIN_MAX_ATTEMPTS`, `LOGIN_LOCK_MINUTES` | Bloqueio de login (padrão 5 falhas / 15 min). |

No Coolify, desmarque "Available at Buildtime" para segredos.

## 3. Segurança implementada

- Sessão revogável (`tokenVersion`): trocar/redefinir senha ou mudar o papel derruba sessões antigas. Admin e operação são conferidos no banco a cada requisição; cotistas expiram em até 15 min.
- Bloqueio por tentativas, mensagem de erro uniforme, limites por IP nas rotas sensíveis.
- 2FA TOTP com códigos de recuperação (Minha conta > Segurança). Admin pode redefinir o 2FA de um usuário.
- Cabeçalhos de segurança na API e no site; comprovantes públicos só aceitam link `https://`.

## 4. Backup e restauração

- O serviço `backup` do `docker-compose.production.yml` gera `pg_dump` comprimido no volume `backup_data` com retenção configurável e confere a restauração.
- **Copie o volume para fora do servidor** (bucket S3/Backblaze, outro disco). Backup no mesmo disco não protege contra perda do servidor.
- Teste uma restauração real em ambiente separado antes de lançar: `infra/backup/restore-check.sh`.

## 5. Apuração e transparência

- Após o sorteio, o worker apura automaticamente as modalidades suportadas (Mega-Sena, Lotofácil, Quina, Lotomania, Dupla Sena, Timemania, Dia de Sorte): prêmio por jogo e por faixa, rateio por cota em centavos (sem sobra), avisos aos cotistas e alerta à equipe.
- **Sem apuração automática**: Super Sete, Loteca e +Milionária/Trevos — conferir e repassar manualmente.
- A página do bolão mostra a transparência (jogos, comprovante, código do bilhete, apuração) assim que o bolão é registrado.

## 6. Monitoramento

- `GET /health` (vivo) e `GET /health/ready` (banco pronto) para o Coolify/uptime.
- Painel **Saúde da operação** na Visão geral do admin e `GET /operacao/saude`: bolões pagos sem registro, pagamentos pendentes antigos, falhas de sincronização.
- Configure um monitor externo (UptimeRobot etc.) apontando para `/health/ready`.

## 7. Antes de abrir ao público

1. Disco do servidor com pelo menos 10 GB livres (builds Docker enchem o disco).
2. Todas as migrações aplicadas (0011 e 0012 rodam automaticamente no deploy).
3. Conta admin com 2FA ativo.
4. Um bolão de teste ponta a ponta: reserva, pagamento Cora, fechamento, registro com comprovante, apuração.
5. Webhook de alerta recebendo uma mensagem de teste.
6. Backup rodando e restauração testada.
