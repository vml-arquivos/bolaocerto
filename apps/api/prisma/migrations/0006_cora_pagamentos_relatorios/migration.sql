-- Cora (boleto + Pix), baixa manual e relatorios.
-- Somente adiciona colunas/indices/valor de enum: nao altera nem remove dados existentes.
ALTER TYPE "MetodoPagamento" ADD VALUE IF NOT EXISTS 'manual';

ALTER TABLE "pagamentos"
  ADD COLUMN "qr_code_url" TEXT,
  ADD COLUMN "linha_digitavel" TEXT,
  ADD COLUMN "codigo_barras" TEXT,
  ADD COLUMN "boleto_url" TEXT,
  ADD COLUMN "vencimento_em" TIMESTAMP(3),
  ADD COLUMN "origem" VARCHAR(20) NOT NULL DEFAULT 'gateway',
  ADD COLUMN "forma_baixa" VARCHAR(30),
  ADD COLUMN "observacao" TEXT,
  ADD COLUMN "baixa_por" UUID;

ALTER TABLE "cotas"
  ADD COLUMN "origem_venda" VARCHAR(20) NOT NULL DEFAULT 'online';

CREATE INDEX "pagamentos_status_criado_em_idx" ON "pagamentos"("status", "criado_em");
CREATE INDEX "cotas_criado_em_idx" ON "cotas"("criado_em");
