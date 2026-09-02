-- Three-profile operations: user, affiliate and administrator.
-- Additive migration: existing users, affiliates, groups, pools and shares remain intact.

CREATE TYPE "TipoConvite" AS ENUM ('usuario', 'afiliado');
CREATE TYPE "StatusConvite" AS ENUM ('ativo', 'usado', 'revogado', 'expirado');

ALTER TABLE "afiliados"
  ADD COLUMN "parent_afiliado_id" UUID;

ALTER TABLE "afiliados"
  ADD CONSTRAINT "afiliados_parent_afiliado_id_fkey"
  FOREIGN KEY ("parent_afiliado_id") REFERENCES "afiliados"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "afiliados_parent_afiliado_id_idx"
  ON "afiliados"("parent_afiliado_id");

CREATE TABLE "convites" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "codigo" VARCHAR(40) NOT NULL,
  "tipo" "TipoConvite" NOT NULL,
  "status" "StatusConvite" NOT NULL DEFAULT 'ativo',
  "criado_por_usuario_id" UUID NOT NULL,
  "afiliado_origem_id" UUID,
  "usado_por_usuario_id" UUID,
  "email_destino" VARCHAR(180),
  "expira_em" TIMESTAMP(3) NOT NULL,
  "usado_em" TIMESTAMP(3),
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "convites_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "convites_codigo_key" ON "convites"("codigo");
CREATE INDEX "convites_status_expira_em_idx" ON "convites"("status", "expira_em");
CREATE INDEX "convites_afiliado_origem_id_idx" ON "convites"("afiliado_origem_id");

ALTER TABLE "convites"
  ADD CONSTRAINT "convites_criado_por_usuario_id_fkey"
  FOREIGN KEY ("criado_por_usuario_id") REFERENCES "usuarios"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE,
  ADD CONSTRAINT "convites_afiliado_origem_id_fkey"
  FOREIGN KEY ("afiliado_origem_id") REFERENCES "afiliados"("id")
  ON DELETE SET NULL ON UPDATE CASCADE,
  ADD CONSTRAINT "convites_usado_por_usuario_id_fkey"
  FOREIGN KEY ("usado_por_usuario_id") REFERENCES "usuarios"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;
