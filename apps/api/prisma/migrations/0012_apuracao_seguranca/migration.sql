-- Apuração detalhada por jogo (transparência), código do bilhete registrado na CAIXA e segurança de contas
-- (sessões revogáveis, bloqueio por tentativas e autenticação em dois fatores). 100% aditiva.
ALTER TABLE "boloes" ADD COLUMN "premio_total" DECIMAL(16,2);
ALTER TABLE "boloes" ADD COLUMN "apuracao" JSONB;
ALTER TABLE "boloes" ADD COLUMN "apurado_em" TIMESTAMP(3);
ALTER TABLE "boloes" ADD COLUMN "codigo_bilhete" VARCHAR(80);

ALTER TABLE "usuarios" ADD COLUMN "token_version" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "usuarios" ADD COLUMN "tentativas_login" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "usuarios" ADD COLUMN "bloqueado_ate" TIMESTAMP(3);
ALTER TABLE "usuarios" ADD COLUMN "totp_secret" TEXT;
ALTER TABLE "usuarios" ADD COLUMN "totp_ativo" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "usuarios" ADD COLUMN "totp_recuperacao" TEXT[] NOT NULL DEFAULT ARRAY[]::TEXT[];
