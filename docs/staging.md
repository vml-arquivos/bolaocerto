# Ambiente de teste (staging)

Objetivo: ter um BL separado da produção, com banco próprio, para testar cada versão antes de publicar e rodar os testes de `e2e/`.

## O que criar no Coolify

1. **Banco**: um PostgreSQL novo (outro banco, não o de produção).
2. **API e site**: duas aplicações novas, apontando para o mesmo repositório (use uma branch `staging`, ou a `main` com deploy manual), mesmos Dockerfile/comandos da produção.
3. **Domínio**: um endereço de teste (ex.: `teste.seudominio.com.br`) só para o site; a API fica interna.
4. A droplet tem pouca memória: se ficar apertado, ligue o staging só na hora de testar e desligue depois.

## Variáveis do staging

Copie as da produção e troque estas (valores de teste, nunca os de produção):

- `DATABASE_URL` → o banco novo do staging.
- `WEB_ORIGIN`, `APP_PUBLIC_URL` → o endereço de teste.
- `ADMIN_BOOTSTRAP_EMAIL`, `ADMIN_BOOTSTRAP_PASSWORD`, `ADMIN_BOOTSTRAP_CPF` → um administrador só do staging.
- `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `RECEIPT_SECRET`, `TOTP_ENC_KEY` → valores novos (não reutilize os de produção).
- `PAYMENTS_ENABLED=false` e `PAYMENT_TEST_MODE=true` → sem cobrança real. Não coloque credenciais reais da Cora aqui.
- `RATE_LIMIT_PER_MINUTE=5000` (opcional) → deixa os testes automáticos navegarem sem bater no limite.

## Rotina de cada versão

1. Publicar a versão no staging e esperar o deploy.
2. Rodar os testes de `e2e/` apontando para o staging (veja `e2e/README.md`) — ou apenas esperar o job `navegacao` do GitHub, que faz o mesmo num ambiente descartável a cada push.
3. Olhar o painel do staging com seus olhos nas telas que mudaram.
4. Só então publicar em produção.

## O que o GitHub já testa sozinho

A cada push: tipos, testes unitários, contrato HTTP, concorrência financeira em PostgreSQL real, e o job `navegacao` (banco novo + API + site + navegador).
