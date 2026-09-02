# Deploy Web — BL Bolão Livre

## Escopo desta versão

Esta é uma beta Web controlada. Ela inclui portal responsivo, autenticação por cookies HTTP-only, catálogo, detalhes, área do cotista, administração inicial, sincronização de concursos, PostgreSQL, migrações, seed e worker. Pagamentos e reservas financeiras permanecem desabilitados.

## Coolify

1. Crie um recurso a partir do repositório `vml-arquivos/bolaocerto`.
2. Selecione **Docker Compose** e o arquivo `docker-compose.production.yml`.
3. Configure todas as variáveis listadas em `.env.production.example`.
4. Gere segredos diferentes para JWT de acesso, JWT de renovação e webhook.
5. Use um CPF válido e uma senha exclusiva no bootstrap administrativo.
6. Aponte o domínio para o serviço `web`, porta `3000`.
7. Faça o primeiro deploy e aguarde os healthchecks de `postgres`, `api` e `web`.

## Primeiro acesso

1. Entre com `ADMIN_BOOTSTRAP_EMAIL` e `ADMIN_BOOTSTRAP_PASSWORD`.
2. Acesse `/admin`.
3. Sincronize os concursos.
4. Crie o primeiro bolão no grupo oficial.
5. Cadastre um novo cotista e execute a jornada de reserva.

## Teste mestre

- Home abre em desktop e celular;
- cadastro de maior de 18 anos funciona;
- login mantém a sessão;
- concurso é sincronizado da fonte configurada;
- administrador cria bolão;
- bolão aparece na Home;
- página do bolão informa claramente que pagamentos ainda não estão habilitados;
- nenhuma cobrança, Pix ou reserva financeira é criada;
- API responde em `/api/v1/health`;
- Web responde em `/health`;
- logs não apresentam reinícios ou erros de migração.

## Bloqueios para operação real

- revisão jurídica dos termos e do modelo operacional;
- contrato e validação das lotéricas/parceiros;
- credenciais e webhook do gateway homologado;
- política de privacidade com identificação do controlador e canal LGPD;
- serviço de arquivos/comprovantes;
- e-mail e WhatsApp transacionais;
- teste de carga, backup e restauração;
- homologação completa de conciliação e premiação.

Não desative `PLATFORM_TEST_MODE` antes de concluir esses itens.
