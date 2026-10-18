-- CRM de apostadores: etiquetas/acompanhamento por usuário e histórico de notas internas.
-- Mudança 100% aditiva (duas tabelas novas).
CREATE TABLE "crm_perfis" (
  "usuario_id" UUID NOT NULL,
  "etiquetas" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[],
  "proximo_contato_em" TIMESTAMP(3),
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_perfis_pkey" PRIMARY KEY ("usuario_id")
);

CREATE TABLE "crm_notas" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "usuario_id" UUID NOT NULL,
  "autor_id" UUID NOT NULL,
  "texto" TEXT NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "crm_notas_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "crm_notas_usuario_id_criado_em_idx" ON "crm_notas"("usuario_id", "criado_em");
CREATE INDEX "crm_perfis_proximo_contato_em_idx" ON "crm_perfis"("proximo_contato_em");

ALTER TABLE "crm_perfis" ADD CONSTRAINT "crm_perfis_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_notas" ADD CONSTRAINT "crm_notas_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "crm_notas" ADD CONSTRAINT "crm_notas_autor_id_fkey" FOREIGN KEY ("autor_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
