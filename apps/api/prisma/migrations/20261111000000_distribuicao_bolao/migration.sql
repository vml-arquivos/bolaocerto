-- Distribuição de bolão para afiliados: link enviado pela equipe e afiliados que receberam para vender.
CREATE TABLE IF NOT EXISTS "bolao_distribuicoes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bolao_id" UUID NOT NULL,
  "codigo" VARCHAR(40) NOT NULL,
  "criado_por" UUID NOT NULL,
  "afiliado_alvo_id" UUID,
  "revogado_em" TIMESTAMP(3),
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "bolao_distribuicoes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "bolao_distribuicoes_codigo_key" ON "bolao_distribuicoes"("codigo");
CREATE INDEX IF NOT EXISTS "bolao_distribuicoes_bolao_id_idx" ON "bolao_distribuicoes"("bolao_id");
ALTER TABLE "bolao_distribuicoes" DROP CONSTRAINT IF EXISTS "bolao_distribuicoes_bolao_id_fkey";
ALTER TABLE "bolao_distribuicoes" ADD CONSTRAINT "bolao_distribuicoes_bolao_id_fkey" FOREIGN KEY ("bolao_id") REFERENCES "boloes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bolao_distribuicoes" DROP CONSTRAINT IF EXISTS "bolao_distribuicoes_criado_por_fkey";
ALTER TABLE "bolao_distribuicoes" ADD CONSTRAINT "bolao_distribuicoes_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "bolao_distribuicoes" DROP CONSTRAINT IF EXISTS "bolao_distribuicoes_afiliado_alvo_id_fkey";
ALTER TABLE "bolao_distribuicoes" ADD CONSTRAINT "bolao_distribuicoes_afiliado_alvo_id_fkey" FOREIGN KEY ("afiliado_alvo_id") REFERENCES "afiliados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "bolao_afiliados" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bolao_id" UUID NOT NULL,
  "afiliado_id" UUID NOT NULL,
  "distribuicao_id" UUID,
  "enviado_por" UUID NOT NULL,
  "aceito_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removido_em" TIMESTAMP(3),
  "removido_por" UUID,
  CONSTRAINT "bolao_afiliados_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "bolao_afiliados_bolao_id_afiliado_id_key" ON "bolao_afiliados"("bolao_id", "afiliado_id");
CREATE INDEX IF NOT EXISTS "bolao_afiliados_afiliado_id_idx" ON "bolao_afiliados"("afiliado_id");
ALTER TABLE "bolao_afiliados" DROP CONSTRAINT IF EXISTS "bolao_afiliados_bolao_id_fkey";
ALTER TABLE "bolao_afiliados" ADD CONSTRAINT "bolao_afiliados_bolao_id_fkey" FOREIGN KEY ("bolao_id") REFERENCES "boloes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bolao_afiliados" DROP CONSTRAINT IF EXISTS "bolao_afiliados_afiliado_id_fkey";
ALTER TABLE "bolao_afiliados" ADD CONSTRAINT "bolao_afiliados_afiliado_id_fkey" FOREIGN KEY ("afiliado_id") REFERENCES "afiliados"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bolao_afiliados" DROP CONSTRAINT IF EXISTS "bolao_afiliados_distribuicao_id_fkey";
ALTER TABLE "bolao_afiliados" ADD CONSTRAINT "bolao_afiliados_distribuicao_id_fkey" FOREIGN KEY ("distribuicao_id") REFERENCES "bolao_distribuicoes"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "bolao_afiliados" DROP CONSTRAINT IF EXISTS "bolao_afiliados_enviado_por_fkey";
ALTER TABLE "bolao_afiliados" ADD CONSTRAINT "bolao_afiliados_enviado_por_fkey" FOREIGN KEY ("enviado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
