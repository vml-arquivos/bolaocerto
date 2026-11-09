-- Funil de conversão: contagem agregada por dia e etapa, sem dado pessoal.
CREATE TABLE "contadores_funil" (
    "dia" DATE NOT NULL,
    "nome" VARCHAR(30) NOT NULL,
    "total" INTEGER NOT NULL DEFAULT 0,
    CONSTRAINT "contadores_funil_pkey" PRIMARY KEY ("dia", "nome")
);
