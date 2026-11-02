# Sem acesso e sem e-mail: passo a passo

## 1. Voltar a entrar agora (sem depender de e-mail)
No Coolify: abra a aplicação da **API** → aba **Terminal** → entre no terminal do container e rode (troque o e-mail e escolha uma senha só com números, de 6 a 8 dígitos):

```
cd /app/apps/api
export RECOVERY_ADMIN_EMAIL='SEU_EMAIL_DE_ADMIN'
printf '%s' '123456' | node dist/tools/recover-admin.js --apply
```
Aparece "Senha atualizada…". Entre no site com essa senha e troque por outra em Minha conta. Se você usa segundo fator (autenticador), o código continua sendo pedido.

## 2. Descobrir por que o e-mail não chega
No mesmo terminal:
```
cd /app/apps/api
node dist/tools/test-email.js SEU_EMAIL
```
O teste mostra o que o servidor está lendo (sem a senha), se as portas de e-mail abrem a partir do servidor e o motivo exato da falha. Causas mais comuns:
- **Porta bloqueada pelo servidor** (DigitalOcean costuma bloquear 587/465): use `SMTP_PORT=2525` e `SMTP_SECURE=false`.
- **Login recusado:** `SMTP_USER` é o "Login SMTP" (xxxx@smtp-brevo.com) e `SMTP_PASS` é a "Chave SMTP", não a senha da conta.
- **Nomes aceitos:** a senha pode vir em `SMTP_PASS` ou `SMTP_PASSWORD`; o remetente em `MAIL_FROM` ou em `SMTP_FROM_EMAIL` + `SMTP_FROM_NAME`; também valem `SMTP_REPLY_TO`, `SMTP_REQUIRE_TLS` e `SMTP_ENABLED=false` (desliga).
- **Remetente não validado:** o e-mail de `MAIL_FROM` precisa estar validado na Brevo (Remetentes, domínios e IPs).
- **Variáveis na aplicação errada ou sem redeploy:** precisam estar na **API** e valem só depois de Salvar + Redeploy.
- O "esqueci minha senha" aceita 3 pedidos por hora por conta; depois disso espere.

A partir desta versão, o log da API mostra logo ao subir "E-mail pronto" ou "E-mail NÃO está funcionando: <motivo>".
