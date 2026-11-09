-- Indicação de clientes e carteira (crédito BL).
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "codigo_indicacao" VARCHAR(12);
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "indicado_por_usuario_id" UUID;
CREATE UNIQUE INDEX IF NOT EXISTS "usuarios_codigo_indicacao_key" ON "usuarios"("codigo_indicacao");
ALTER TABLE "usuarios" DROP CONSTRAINT IF EXISTS "usuarios_indicado_por_usuario_id_fkey";
ALTER TABLE "usuarios" ADD CONSTRAINT "usuarios_indicado_por_usuario_id_fkey" FOREIGN KEY ("indicado_por_usuario_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE IF NOT EXISTS "carteira_movimentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "tipo" VARCHAR(30) NOT NULL,
    "valor_centavos" INTEGER NOT NULL,
    "descricao" VARCHAR(200) NOT NULL,
    "chave" VARCHAR(80),
    "criado_por" UUID,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "carteira_movimentos_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX IF NOT EXISTS "carteira_movimentos_chave_key" ON "carteira_movimentos"("chave");
CREATE INDEX IF NOT EXISTS "carteira_movimentos_usuario_id_criado_em_idx" ON "carteira_movimentos"("usuario_id","criado_em");
ALTER TABLE "carteira_movimentos" DROP CONSTRAINT IF EXISTS "carteira_movimentos_usuario_id_fkey";
ALTER TABLE "carteira_movimentos" ADD CONSTRAINT "carteira_movimentos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
