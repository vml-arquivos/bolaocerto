-- Comissão definida pelo administrador no convite de afiliado (vira a comissão do afiliado no cadastro).
ALTER TABLE "convites" ADD COLUMN "comissao_pct" DECIMAL(5,2);
ALTER TABLE "convites" ADD CONSTRAINT "convites_comissao_pct_check" CHECK ("comissao_pct" IS NULL OR ("comissao_pct" >= 0 AND "comissao_pct" <= 100));
