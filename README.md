# BL — Bolão Livre

O nome técnico deste repositório é `bolaocerto`. A marca comercial e toda a interface do produto são **BL — Bolão Livre**.

Monorepositório da plataforma Web para gerenciamento de participações vinculadas a concursos oficiais:

- `apps/web`: portal público, cadastro, login, área do cotista e administração;
- `apps/api`: API NestJS, autenticação, bolões, cotas, pagamentos, afiliados, operação e auditoria;
- `apps/worker`: sincronização de concursos e apuração;
- `apps/mobile`: base mobile preservada para uma fase posterior;
- `packages/shared-types`: tipos compartilhados.

## Desenvolvimento

Requisitos: Node.js 22+, pnpm 11 e PostgreSQL 16+.

```bash
cp .env.example .env
pnpm install --frozen-lockfile
pnpm db:generate
pnpm db:migrate
pnpm db:seed
pnpm dev
```

Web: `http://localhost:3000`  
API: `http://localhost:3001/api/v1`  
Saúde: `/health` e `/api/v1/health`

## Validação

```bash
pnpm lint
pnpm test
pnpm build
```

## Produção controlada

Use `docker-compose.production.yml` no Coolify. Copie as chaves de `.env.production.example`, substitua todos os valores de exemplo e publique inicialmente com:

```env
PAYMENTS_ENABLED=false
PAYMENT_PROVIDER=disabled
PAYMENT_TEST_MODE=false
PLATFORM_TEST_MODE=true
```

Nesse modo, o sistema não cria reserva financeira, cobrança, Pix ou webhook. Para liberar a operação financeira, configure o provedor homologado e conclua a validação jurídica, contratual e operacional.

Consulte [docs/deploy-production.md](docs/deploy-production.md) para o checklist completo.
