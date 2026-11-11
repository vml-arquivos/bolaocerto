-- Cupons de desconto e campanhas de cashback (só o administrador cria; valem para grupos e clientes escolhidos).
CREATE TABLE IF NOT EXISTS "cupons" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "codigo" VARCHAR(40) NOT NULL,
  "descricao" VARCHAR(200),
  "tipo" VARCHAR(12) NOT NULL,
  "valor" DECIMAL(10,2) NOT NULL,
  "desconto_maximo_centavos" INTEGER,
  "valor_minimo_centavos" INTEGER,
  "automatico" BOOLEAN NOT NULL DEFAULT false,
  "ativo" BOOLEAN NOT NULL DEFAULT true,
  "inicio_em" TIMESTAMP(3),
  "fim_em" TIMESTAMP(3),
  "limite_total" INTEGER,
  "limite_por_cliente" INTEGER,
  "grupo_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "usuario_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "criado_por" UUID NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cupons_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "cupons_codigo_key" ON "cupons"("codigo");
ALTER TABLE "cupons" DROP CONSTRAINT IF EXISTS "cupons_criado_por_fkey";
ALTER TABLE "cupons" ADD CONSTRAINT "cupons_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "cupom_usos" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "cupom_id" UUID NOT NULL,
  "cota_id" UUID NOT NULL,
  "usuario_id" UUID NOT NULL,
  "desconto_centavos" INTEGER NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cupom_usos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "cupom_usos_cota_id_key" ON "cupom_usos"("cota_id");
CREATE INDEX IF NOT EXISTS "cupom_usos_cupom_id_idx" ON "cupom_usos"("cupom_id");
CREATE INDEX IF NOT EXISTS "cupom_usos_usuario_id_idx" ON "cupom_usos"("usuario_id");
ALTER TABLE "cupom_usos" DROP CONSTRAINT IF EXISTS "cupom_usos_cupom_id_fkey";
ALTER TABLE "cupom_usos" ADD CONSTRAINT "cupom_usos_cupom_id_fkey" FOREIGN KEY ("cupom_id") REFERENCES "cupons"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "cupom_usos" DROP CONSTRAINT IF EXISTS "cupom_usos_cota_id_fkey";
ALTER TABLE "cupom_usos" ADD CONSTRAINT "cupom_usos_cota_id_fkey" FOREIGN KEY ("cota_id") REFERENCES "cotas"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "cupom_usos" DROP CONSTRAINT IF EXISTS "cupom_usos_usuario_id_fkey";
ALTER TABLE "cupom_usos" ADD CONSTRAINT "cupom_usos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "cashback_campanhas" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "nome" VARCHAR(120) NOT NULL,
  "percentual" DECIMAL(5,2) NOT NULL,
  "valor_minimo_centavos" INTEGER,
  "maximo_por_compra_centavos" INTEGER,
  "orcamento_centavos" INTEGER,
  "ativa" BOOLEAN NOT NULL DEFAULT false,
  "inicio_em" TIMESTAMP(3),
  "fim_em" TIMESTAMP(3),
  "grupo_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "usuario_ids" UUID[] NOT NULL DEFAULT ARRAY[]::UUID[],
  "criado_por" UUID NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "cashback_campanhas_pkey" PRIMARY KEY ("id")
);
ALTER TABLE "cashback_campanhas" DROP CONSTRAINT IF EXISTS "cashback_campanhas_criado_por_fkey";
ALTER TABLE "cashback_campanhas" ADD CONSTRAINT "cashback_campanhas_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
