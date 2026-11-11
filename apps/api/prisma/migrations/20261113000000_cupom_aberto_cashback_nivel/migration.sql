-- Cupom para qualquer pessoa com o código (inclusive 100%) e cashback por nível de gasto e de compras. Idempotente.
ALTER TABLE "cupom_usos" ADD COLUMN IF NOT EXISTS "subsidio_centavos" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "cashback_campanhas" ADD COLUMN IF NOT EXISTS "gasto_minimo_centavos" INTEGER;
ALTER TABLE "cashback_campanhas" ADD COLUMN IF NOT EXISTS "compras_minimas" INTEGER;
