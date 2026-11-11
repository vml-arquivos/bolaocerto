-- Pedido de cancelamento de cota paga feito pelo cliente (prazo de arrependimento). Idempotente.
CREATE TABLE IF NOT EXISTS "pedidos_cancelamento" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "cota_id" UUID NOT NULL,
  "usuario_id" UUID NOT NULL,
  "motivo" VARCHAR(500),
  "status" VARCHAR(20) NOT NULL DEFAULT 'pendente',
  "valor_centavos" INTEGER NOT NULL,
  "devolucao" VARCHAR(20),
  "resposta" VARCHAR(500),
  "resolvido_em" TIMESTAMP(3),
  "resolvido_por" UUID,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "pedidos_cancelamento_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "pedidos_cancelamento_status_criado_em_idx" ON "pedidos_cancelamento"("status", "criado_em");
CREATE INDEX IF NOT EXISTS "pedidos_cancelamento_cota_id_idx" ON "pedidos_cancelamento"("cota_id");
CREATE INDEX IF NOT EXISTS "pedidos_cancelamento_usuario_id_idx" ON "pedidos_cancelamento"("usuario_id");
-- No máximo um pedido em análise por cota.
CREATE UNIQUE INDEX IF NOT EXISTS "pedidos_cancelamento_um_pendente_por_cota" ON "pedidos_cancelamento"("cota_id") WHERE "status" = 'pendente';
DO $$ BEGIN
  ALTER TABLE "pedidos_cancelamento" ADD CONSTRAINT "pedidos_cancelamento_cota_id_fkey" FOREIGN KEY ("cota_id") REFERENCES "cotas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
DO $$ BEGIN
  ALTER TABLE "pedidos_cancelamento" ADD CONSTRAINT "pedidos_cancelamento_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
