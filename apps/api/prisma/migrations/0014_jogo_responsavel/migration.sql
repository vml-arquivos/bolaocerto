-- Jogo responsável: pausa de participação (30/60/90 dias ou permanente) e limite mensal de gastos.
-- Aumentar/remover o limite só vale 24 h depois (campos "pendente"). Mudança 100% aditiva (colunas novas com padrão).
ALTER TABLE "usuarios" ADD COLUMN "pausa_ate" TIMESTAMP(3);
ALTER TABLE "usuarios" ADD COLUMN "pausa_permanente" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "usuarios" ADD COLUMN "limite_mensal" DECIMAL(10,2);
ALTER TABLE "usuarios" ADD COLUMN "limite_mensal_pendente" DECIMAL(10,2);
ALTER TABLE "usuarios" ADD COLUMN "limite_mensal_pendente_em" TIMESTAMP(3);
