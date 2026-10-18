-- NFS-e (Cora), endereco do tomador e metodos de pagamento futuros.
-- Somente adiciona tipos, colunas e tabela: nao altera nem remove dados existentes.
ALTER TYPE "MetodoPagamento" ADD VALUE IF NOT EXISTS 'pix_automatico';

CREATE TYPE "StatusNotaFiscal" AS ENUM ('aguardando', 'aguardando_certificado', 'emitida', 'erro', 'cancelada');

ALTER TABLE "usuarios"
  ADD COLUMN "endereco_cep" VARCHAR(8),
  ADD COLUMN "endereco_logradouro" VARCHAR(120),
  ADD COLUMN "endereco_numero" VARCHAR(20),
  ADD COLUMN "endereco_complemento" VARCHAR(80),
  ADD COLUMN "endereco_bairro" VARCHAR(80),
  ADD COLUMN "endereco_cidade" VARCHAR(80),
  ADD COLUMN "endereco_uf" VARCHAR(2);

CREATE TABLE "notas_fiscais" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "pagamento_id" UUID NOT NULL,
  "status" "StatusNotaFiscal" NOT NULL DEFAULT 'aguardando',
  "origem" VARCHAR(20) NOT NULL DEFAULT 'cora',
  "provedor_id" VARCHAR(100),
  "numero" VARCHAR(40),
  "valor" DECIMAL(10,2) NOT NULL,
  "iss_pct" DECIMAL(5,2),
  "descricao" TEXT,
  "pdf_url" TEXT,
  "xml_url" TEXT,
  "erro" TEXT,
  "observacao" TEXT,
  "emitida_em" TIMESTAMP(3),
  "cancelada_em" TIMESTAMP(3),
  "criado_por" UUID,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "notas_fiscais_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "notas_fiscais_pagamento_id_key" ON "notas_fiscais"("pagamento_id");
CREATE INDEX "notas_fiscais_status_criado_em_idx" ON "notas_fiscais"("status", "criado_em");
ALTER TABLE "notas_fiscais" ADD CONSTRAINT "notas_fiscais_pagamento_id_fkey" FOREIGN KEY ("pagamento_id") REFERENCES "pagamentos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
