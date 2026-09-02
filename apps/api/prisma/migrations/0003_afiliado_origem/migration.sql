-- Add referral attribution to user registrations without changing existing rows.
ALTER TABLE "usuarios"
  ADD COLUMN "indicado_por_afiliado_id" UUID;

ALTER TABLE "usuarios"
  ADD CONSTRAINT "usuarios_indicado_por_afiliado_id_fkey"
  FOREIGN KEY ("indicado_por_afiliado_id") REFERENCES "afiliados"("id")
  ON DELETE SET NULL ON UPDATE CASCADE;

CREATE INDEX "usuarios_indicado_por_afiliado_id_idx"
  ON "usuarios"("indicado_por_afiliado_id");
