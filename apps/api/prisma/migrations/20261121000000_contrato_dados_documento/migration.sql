-- Dados extras do afiliado para o contrato (RG, estado civil, profissão...) e documento de identidade (frente e verso).
ALTER TABLE "afiliados" ADD COLUMN IF NOT EXISTS "dados_contrato" JSONB;
ALTER TABLE "afiliados" ADD COLUMN IF NOT EXISTS "documento_identidade" JSONB;
