-- Web Push, comunicados da equipe e configurações geradas pelo sistema.
ALTER TABLE "notificacoes" ADD COLUMN "push_enviado_em" TIMESTAMP(3);

CREATE TABLE "push_inscricoes" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "usuario_id" UUID NOT NULL,
  "endpoint" TEXT NOT NULL,
  "p256dh" TEXT NOT NULL,
  "auth" TEXT NOT NULL,
  "agente" VARCHAR(200),
  "falhas" INTEGER NOT NULL DEFAULT 0,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "ultimo_envio_em" TIMESTAMP(3),
  CONSTRAINT "push_inscricoes_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "push_inscricoes_endpoint_key" ON "push_inscricoes"("endpoint");
CREATE INDEX "push_inscricoes_usuario_id_idx" ON "push_inscricoes"("usuario_id");
ALTER TABLE "push_inscricoes" ADD CONSTRAINT "push_inscricoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "comunicados" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "titulo" VARCHAR(120) NOT NULL,
  "mensagem" VARCHAR(600) NOT NULL,
  "link" VARCHAR(200),
  "publico" VARCHAR(30) NOT NULL,
  "bolao_id" UUID,
  "grupo_id" UUID,
  "enviar_email" BOOLEAN NOT NULL DEFAULT false,
  "total_destinatarios" INTEGER NOT NULL,
  "criado_por" UUID NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "comunicados_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "comunicados_criado_em_idx" ON "comunicados"("criado_em");

CREATE TABLE "configuracoes_sistema" (
  "chave" VARCHAR(60) NOT NULL,
  "valor" TEXT NOT NULL,
  "atualizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "configuracoes_sistema_pkey" PRIMARY KEY ("chave")
);
