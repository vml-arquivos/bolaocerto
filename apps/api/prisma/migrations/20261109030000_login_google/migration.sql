-- Login com Google: guarda o identificador da conta Google vinculada (opcional).
ALTER TABLE "usuarios" ADD COLUMN IF NOT EXISTS "google_sub" VARCHAR(64);
CREATE UNIQUE INDEX IF NOT EXISTS "usuarios_google_sub_key" ON "usuarios"("google_sub");
