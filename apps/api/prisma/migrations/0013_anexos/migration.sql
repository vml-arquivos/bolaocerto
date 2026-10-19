-- Arquivos anexados aos bolões e às cotas (comprovante da aposta, jogos registrados, recibo individual).
-- Mudança 100% aditiva: um tipo e uma tabela nova. O conteúdo do arquivo fica no disco (UPLOAD_DIR); aqui só o registro.
CREATE TYPE "TipoAnexo" AS ENUM ('comprovante_aposta', 'jogos_registrados', 'recibo_cota', 'outro');

CREATE TABLE "anexos" (
  "id" UUID NOT NULL DEFAULT gen_random_uuid(),
  "bolao_id" UUID NOT NULL,
  "cota_id" UUID,
  "tipo" "TipoAnexo" NOT NULL,
  "nome_original" VARCHAR(200) NOT NULL,
  "mime" VARCHAR(80) NOT NULL,
  "tamanho" INTEGER NOT NULL,
  "sha256" VARCHAR(64) NOT NULL,
  "caminho" VARCHAR(300) NOT NULL,
  "descricao" VARCHAR(200),
  "visivel_participantes" BOOLEAN NOT NULL DEFAULT true,
  "enviado_por" UUID NOT NULL,
  "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "removido_em" TIMESTAMP(3),
  "removido_por" UUID,
  CONSTRAINT "anexos_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "anexos_bolao_id_removido_em_idx" ON "anexos"("bolao_id", "removido_em");
CREATE INDEX "anexos_cota_id_idx" ON "anexos"("cota_id");
CREATE INDEX "anexos_sha256_idx" ON "anexos"("sha256");
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_bolao_id_fkey" FOREIGN KEY ("bolao_id") REFERENCES "boloes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_cota_id_fkey" FOREIGN KEY ("cota_id") REFERENCES "cotas"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "anexos" ADD CONSTRAINT "anexos_enviado_por_fkey" FOREIGN KEY ("enviado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
