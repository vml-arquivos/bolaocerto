# Deploy do BL por Dockerfile

Este modo e indicado para o primeiro ambiente Web de homologacao/producao do
BL - Bolao Livre. Uma unica imagem executa a aplicacao Web, a API interna e o
worker de atualizacao dos concursos. O PostgreSQL deve ser criado como banco
persistente separado na plataforma de hospedagem.

## Configuracao do servico

- Fonte: repositorio `vml-arquivos/bolaocerto`
- Branch: `main`
- Build pack: `Dockerfile`
- Caminho: `Dockerfile`
- Porta publica: `3000`
- Health check: `/health`
- Dominio: o dominio Web escolhido para o BL

Nao e necessario informar target de build. O ultimo estagio do Dockerfile e a
imagem completa de producao.

## Banco de dados

Crie um PostgreSQL 16 persistente na mesma rede privada do servico. Copie a URL
interna completa para `DATABASE_URL`. Nao publique a porta do banco na Internet.

As migracoes e o seed seguro sao executados automaticamente a cada inicializacao.

## Variaveis obrigatorias

Use `.env.production.example` como referencia. No primeiro deploy, mantenha:

```env
PAYMENTS_ENABLED=false
PAYMENT_PROVIDER=disabled
PAYMENT_TEST_MODE=false
PLATFORM_TEST_MODE=true
PLATFORM_PAYMENTS_ENABLED=false
APP_PORT=3000
API_PORT=3001
API_INTERNAL_URL=http://127.0.0.1:3001/api/v1
API_PROXY_URL=http://127.0.0.1:3001
```

Tambem configure `DATABASE_URL`, `WEB_ORIGIN`, os dois segredos JWT, os dados do
administrador inicial, o hash/versao do mandato e as variaveis da integracao de
concursos listadas no arquivo de exemplo.

Nenhuma chave de gateway, Pix ou webhook e necessaria nesta etapa.

## Primeiro teste

Depois que o health check ficar saudavel, valide cadastro, login, painel
administrativo, sincronizacao de concursos, criacao/exibicao de boloes e
persistencia dos dados apos reiniciar o container. Reservas e pagamentos devem
continuar bloqueados nesta fase.
