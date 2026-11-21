-- Contratos do afiliado com assinatura eletrônica (código por e-mail, IP, local e hash do texto). Idempotente.
CREATE TABLE IF NOT EXISTS "contratos" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "numero" VARCHAR(40) NOT NULL,
  "tipo" VARCHAR(30) NOT NULL,
  "status" VARCHAR(20) NOT NULL DEFAULT 'aguardando',
  "titulo" VARCHAR(160) NOT NULL,
  "texto" TEXT NOT NULL,
  "hash" VARCHAR(64) NOT NULL,
  "versao_modelo" VARCHAR(40) NOT NULL,
  "partes" JSONB NOT NULL,
  "origem" VARCHAR(20) NOT NULL DEFAULT 'painel',
  "afiliado_id" UUID,
  "usuario_id" UUID,
  "criado_por_id" UUID,
  "codigo_hash" VARCHAR(64),
  "codigo_expira_em" TIMESTAMP(3),
  "codigo_tentativas" INTEGER NOT NULL DEFAULT 0,
  "codigo_enviado_em" TIMESTAMP(3),
  "codigo_envios" INTEGER NOT NULL DEFAULT 0,
  "assinado_em" TIMESTAMP(3),
  "assinatura" JSONB,
  "empresa_hash" VARCHAR(64) NOT NULL,
  "empresa_assinada_em" TIMESTAMP(3),
  "empresa_assinatura" JSONB,
  "eventos" JSONB NOT NULL DEFAULT '[]',
  "cancelado_em" TIMESTAMP(3),
  "cancelado_por_id" UUID,
  "motivo_cancelamento" VARCHAR(300),
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "contratos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "contratos_numero_key" ON "contratos"("numero");
CREATE INDEX IF NOT EXISTS "contratos_afiliado_id_tipo_idx" ON "contratos"("afiliado_id", "tipo");
CREATE INDEX IF NOT EXISTS "contratos_status_criado_em_idx" ON "contratos"("status", "criado_em");
CREATE INDEX IF NOT EXISTS "contratos_empresa_hash_idx" ON "contratos"("empresa_hash");
-- No máximo um contrato do mesmo tipo aguardando assinatura por afiliado.
CREATE UNIQUE INDEX IF NOT EXISTS "contratos_um_aguardando_por_tipo" ON "contratos"("afiliado_id", "tipo") WHERE "status" = 'aguardando';
DO $$ BEGIN
  ALTER TABLE "contratos" ADD CONSTRAINT "contratos_afiliado_id_fkey" FOREIGN KEY ("afiliado_id") REFERENCES "afiliados"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION WHEN duplicate_object THEN NULL; END $$;
