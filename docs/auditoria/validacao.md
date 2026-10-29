# Evidências de validação — 29/10/2026

Atualização: a revisão da vitrine está descrita em `2026-10-29-vitrine-resultados.md`: 287 testes API + 9 web + 15 HTTP = 311 aprovados, e smoke de HTML renderizado. Os números abaixo registram a primeira entrega.

| Verificação | Resultado local |
|---|---|
| Baseline da API, antes das alterações | 29 suítes, 243 testes aprovados |
| API após implementação | 32 suítes, 283 testes aprovados |
| Contratos HTTP / bootstrap Nest | 3 suítes, 15 testes aprovados |
| `prisma validate` com URL local fictícia | Schema válido; não conecta ao banco |
| `pnpm lint` | Verificação TypeScript dos workspaces aprovada |
| `pnpm -r build` | API, worker, shared-types e Next.js aprovados |
| PostgreSQL real | Não executado localmente; teste novo incluído no CI |
| Pix e SMTP reais | Não executados; sem credenciais de homologação |
| Navegação visual/E2E de browser | Não executada; build e contratos HTTP não equivalem a isso |
| Deploy / dados de produção | Não acessados ou alterados |

283 + 15 = 298 testes locais. A suíte financeira nova cobre preços oficiais, validação de seleções, conservação dos centavos, eventos irrelevantes do Asaas, divergência de valor, confirmação após estorno, pagamento tardio e recuperação da fila de e-mail. Testes com mocks verificam lógica e transições; não comprovam locks de PostgreSQL.

O teste `apps/api/scripts/financial-integration.ts` foi conectado ao CI existente com PostgreSQL 16. O GitHub recusou a gravação com HTTP 403 (Resource not accessible by integration); não foi criado PR nem disparado CI remoto. Após aplicar o patch em uma branch, conferir o resultado do CI antes de merge. Não assumir aprovação só por o arquivo existir.

O ambiente local não possuía PostgreSQL executável. A tentativa de preparar o servidor local falhou nas permissões de instalação; nenhuma validação de migração aplicada foi inventada.
