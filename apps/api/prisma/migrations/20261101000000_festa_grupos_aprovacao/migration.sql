-- Concursos de festa (Mega da Virada, São João...), grupos com membros e aprovação de bolões de afiliados.
-- Mudança 100% aditiva: colunas novas com padrão e uma tabela nova.
ALTER TABLE "concursos" ADD COLUMN "especial" VARCHAR(40);
ALTER TABLE "concursos" ADD COLUMN "nome_especial" VARCHAR(80);
ALTER TABLE "concursos" ADD COLUMN "numero_definido" BOOLEAN NOT NULL DEFAULT true;

ALTER TABLE "grupos" ADD COLUMN "capacidade_extra" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "boloes" ADD COLUMN "aprovacao_solicitada_em" TIMESTAMP(3);
ALTER TABLE "boloes" ADD COLUMN "aprovado_em" TIMESTAMP(3);
ALTER TABLE "boloes" ADD COLUMN "aprovado_por" UUID;

ALTER TABLE "convites" ADD COLUMN "grupo_id" UUID;
ALTER TABLE "convites" ADD CONSTRAINT "convites_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "grupo_membros" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "grupo_id" UUID NOT NULL,
  "usuario_id" UUID NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "grupo_membros_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "grupo_membros_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "grupo_membros_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "grupo_membros_grupo_id_usuario_id_key" ON "grupo_membros"("grupo_id", "usuario_id");
CREATE INDEX "grupo_membros_usuario_id_idx" ON "grupo_membros"("usuario_id");

-- Bolões de afiliado que já estavam abertos antes desta versão continuam valendo como aprovados.
UPDATE "boloes" SET "aprovado_em" = COALESCE("editado_em", "criado_em") WHERE "tipo_organizador" = 'afiliado' AND "status" <> 'rascunho';
