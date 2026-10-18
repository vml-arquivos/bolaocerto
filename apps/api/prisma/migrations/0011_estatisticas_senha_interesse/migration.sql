-- Estatísticas (2º sorteio da Dupla Sena), recuperação de senha, lista "avise-me" e pedido de exclusão (LGPD).
-- Mudança 100% aditiva: colunas novas com padrão e duas tabelas novas.
ALTER TABLE "resultados" ADD COLUMN "numeros_segundo_sorteio" INTEGER[] NOT NULL DEFAULT ARRAY[]::INTEGER[];
ALTER TABLE "usuarios" ADD COLUMN "exclusao_solicitada_em" TIMESTAMP(3);

CREATE TABLE "tokens_senha" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "usuario_id" UUID NOT NULL,
  "token_hash" VARCHAR(64) NOT NULL,
  "expira_em" TIMESTAMP(3) NOT NULL,
  "usado_em" TIMESTAMP(3),
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "tokens_senha_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "tokens_senha_token_hash_key" ON "tokens_senha"("token_hash");
CREATE INDEX "tokens_senha_usuario_id_criado_em_idx" ON "tokens_senha"("usuario_id", "criado_em");
ALTER TABLE "tokens_senha" ADD CONSTRAINT "tokens_senha_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "bolao_interesses" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bolao_id" UUID NOT NULL,
  "usuario_id" UUID NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "notificado_em" TIMESTAMP(3),
  CONSTRAINT "bolao_interesses_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "bolao_interesses_bolao_id_usuario_id_key" ON "bolao_interesses"("bolao_id", "usuario_id");
CREATE INDEX "bolao_interesses_usuario_id_idx" ON "bolao_interesses"("usuario_id");
ALTER TABLE "bolao_interesses" ADD CONSTRAINT "bolao_interesses_bolao_id_fkey" FOREIGN KEY ("bolao_id") REFERENCES "boloes"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "bolao_interesses" ADD CONSTRAINT "bolao_interesses_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE INDEX "notificacoes_usuario_id_lido_em_criado_em_idx" ON "notificacoes"("usuario_id", "lido_em", "criado_em");
