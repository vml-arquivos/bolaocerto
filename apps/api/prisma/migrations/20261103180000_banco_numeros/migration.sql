-- Banco de números: jogos guardados para reaproveitar nos bolões e para estatísticas.
CREATE TABLE "banco_numeros" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "modalidade" VARCHAR(20) NOT NULL,
    "numeros" INTEGER[],
    "quantidade_dezenas" INTEGER NOT NULL,
    "chave" VARCHAR(400) NOT NULL,
    "origem" VARCHAR(20) NOT NULL,
    "estrategia" VARCHAR(30),
    "rotulo" VARCHAR(80),
    "usos" INTEGER NOT NULL DEFAULT 0,
    "ultimo_uso_em" TIMESTAMP(3),
    "criado_por" UUID,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "banco_numeros_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "banco_numeros_chave_key" ON "banco_numeros"("chave");
CREATE INDEX "banco_numeros_modalidade_criado_em_idx" ON "banco_numeros"("modalidade", "criado_em");
