-- "Avise-me quando abrir bolão de [jogo]": preferências por pessoa e modalidade.
CREATE TABLE IF NOT EXISTS "alertas_modalidade" (
    "usuario_id" UUID NOT NULL,
    "modalidade" VARCHAR(30) NOT NULL,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "alertas_modalidade_pkey" PRIMARY KEY ("usuario_id","modalidade")
);
CREATE INDEX IF NOT EXISTS "alertas_modalidade_modalidade_idx" ON "alertas_modalidade"("modalidade");
ALTER TABLE "alertas_modalidade" DROP CONSTRAINT IF EXISTS "alertas_modalidade_usuario_id_fkey";
ALTER TABLE "alertas_modalidade" ADD CONSTRAINT "alertas_modalidade_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
