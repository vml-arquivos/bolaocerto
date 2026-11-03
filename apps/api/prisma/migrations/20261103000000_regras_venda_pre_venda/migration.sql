-- Regras de venda definidas pelo administrador e pré-venda (bolão de data comemorativa vendido antes de apostar).
ALTER TABLE "boloes"
  ADD COLUMN "venda_antecipada" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "venda_inicio_em" TIMESTAMP(3),
  ADD COLUMN "venda_fim_em" TIMESTAMP(3),
  ADD COLUMN "max_cotas_por_pessoa" INTEGER,
  ADD COLUMN "regras_venda" VARCHAR(1200);

ALTER TABLE "boloes" ADD CONSTRAINT "boloes_max_cotas_por_pessoa_check" CHECK ("max_cotas_por_pessoa" IS NULL OR "max_cotas_por_pessoa" >= 1);
ALTER TABLE "boloes" ADD CONSTRAINT "boloes_janela_venda_check" CHECK ("venda_inicio_em" IS NULL OR "venda_fim_em" IS NULL OR "venda_inicio_em" < "venda_fim_em");
