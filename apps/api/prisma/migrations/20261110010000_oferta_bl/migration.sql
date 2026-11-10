-- Intervenção da BL em bolão de afiliado: cotas restantes vendidas num grupo oficial.
ALTER TABLE "boloes" ADD COLUMN IF NOT EXISTS "oferta_bl_grupo_id" UUID;
ALTER TABLE "boloes" ADD COLUMN IF NOT EXISTS "oferta_bl_em" TIMESTAMP(3);
ALTER TABLE "boloes" ADD COLUMN IF NOT EXISTS "oferta_bl_por" UUID;
CREATE INDEX IF NOT EXISTS "boloes_oferta_bl_grupo_id_idx" ON "boloes"("oferta_bl_grupo_id");
ALTER TABLE "boloes" DROP CONSTRAINT IF EXISTS "boloes_oferta_bl_grupo_id_fkey";
ALTER TABLE "boloes" ADD CONSTRAINT "boloes_oferta_bl_grupo_id_fkey" FOREIGN KEY ("oferta_bl_grupo_id") REFERENCES "grupos"("id") ON DELETE SET NULL ON UPDATE CASCADE;
