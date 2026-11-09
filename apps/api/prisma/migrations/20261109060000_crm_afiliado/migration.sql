-- CRM do afiliado: notas, etiquetas e próximo contato sobre os clientes dele.
CREATE TABLE IF NOT EXISTS "crm_afiliado_perfis" (
    "afiliado_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "etiquetas" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "nota" TEXT,
    "proximo_contato_em" TIMESTAMP(3),
    "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "crm_afiliado_perfis_pkey" PRIMARY KEY ("afiliado_id","usuario_id")
);
CREATE INDEX IF NOT EXISTS "crm_afiliado_perfis_afiliado_id_proximo_contato_em_idx" ON "crm_afiliado_perfis"("afiliado_id","proximo_contato_em");
ALTER TABLE "crm_afiliado_perfis" DROP CONSTRAINT IF EXISTS "crm_afiliado_perfis_usuario_id_fkey";
ALTER TABLE "crm_afiliado_perfis" ADD CONSTRAINT "crm_afiliado_perfis_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
