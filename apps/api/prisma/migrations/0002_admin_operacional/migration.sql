-- Alterações incrementais do backoffice BL.
-- Não remove nem altera dados existentes.

CREATE TABLE "jogos_bolao" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bolao_id" UUID NOT NULL,
    "ordem" INTEGER NOT NULL,
    "numeros" INTEGER[] NOT NULL,
    "quantidade_dezenas" INTEGER NOT NULL,
    "custo" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "status" VARCHAR(20) NOT NULL DEFAULT 'ativo',
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "jogos_bolao_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "jogos_bolao_bolao_id_ordem_key" ON "jogos_bolao"("bolao_id", "ordem");
CREATE INDEX "jogos_bolao_bolao_id_status_idx" ON "jogos_bolao"("bolao_id", "status");

ALTER TABLE "jogos_bolao"
  ADD CONSTRAINT "jogos_bolao_bolao_id_fkey"
  FOREIGN KEY ("bolao_id") REFERENCES "boloes"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "repasses_lotes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "codigo" VARCHAR(40) NOT NULL,
    "status" VARCHAR(20) NOT NULL DEFAULT 'rascunho',
    "data_repasse" TIMESTAMP(3),
    "valor_total" DECIMAL(12,2) NOT NULL DEFAULT 0,
    "referencia" VARCHAR(120),
    "comprovante_url" TEXT,
    "observacao" TEXT,
    "criado_por" UUID NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "repasses_lotes_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "repasses_lotes_codigo_key" ON "repasses_lotes"("codigo");
CREATE INDEX "repasses_lotes_status_criado_em_idx" ON "repasses_lotes"("status", "criado_em");

ALTER TABLE "repasses_lotes"
  ADD CONSTRAINT "repasses_lotes_criado_por_fkey"
  FOREIGN KEY ("criado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "comissoes"
  ADD COLUMN "base_calculo" DECIMAL(10,2),
  ADD COLUMN "percentual" DECIMAL(5,2),
  ADD COLUMN "lote_repasse_id" UUID,
  ADD COLUMN "pago_por" UUID,
  ADD COLUMN "pago_em" TIMESTAMP(3),
  ADD COLUMN "observacao" TEXT;

CREATE INDEX "comissoes_status_criado_em_idx" ON "comissoes"("status", "criado_em");
CREATE INDEX "comissoes_lote_repasse_id_idx" ON "comissoes"("lote_repasse_id");

ALTER TABLE "comissoes"
  ADD CONSTRAINT "comissoes_lote_repasse_id_fkey"
  FOREIGN KEY ("lote_repasse_id") REFERENCES "repasses_lotes"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "comissoes"
  ADD CONSTRAINT "comissoes_pago_por_fkey"
  FOREIGN KEY ("pago_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
