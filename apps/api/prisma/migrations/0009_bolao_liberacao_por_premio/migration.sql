-- Bolões condicionais: as cotas só são liberadas quando o prêmio estimado do concurso
-- atingir o valor de gatilho (ex.: R$ 100 milhões). Mudança 100% aditiva.
ALTER TABLE "boloes" ADD COLUMN "premio_minimo_liberacao" DECIMAL(16,2);
ALTER TABLE "boloes" ADD COLUMN "liberado_em" TIMESTAMP(3);
