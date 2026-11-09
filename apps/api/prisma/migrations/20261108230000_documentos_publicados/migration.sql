-- Documentos legais publicados pelo painel (Termos, Privacidade, contratos), com histórico de versões.
CREATE TABLE "documentos_publicados" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "tipo" VARCHAR(30) NOT NULL,
    "versao" VARCHAR(40) NOT NULL,
    "texto" TEXT NOT NULL,
    "hash" VARCHAR(64) NOT NULL,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "publicado_por_id" UUID,
    "publicado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "documentos_publicados_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "documentos_publicados_tipo_publicado_em_idx" ON "documentos_publicados"("tipo", "publicado_em");
