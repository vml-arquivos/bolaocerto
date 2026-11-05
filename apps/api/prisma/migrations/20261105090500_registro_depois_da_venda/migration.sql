-- O comprovante da lotérica deixa de ser exigido antes da venda: pode ser anexado depois, dentro do próprio bolão.
ALTER TABLE "boloes" ALTER COLUMN "comprovante_antes_venda" SET DEFAULT false;
UPDATE "boloes" SET "comprovante_antes_venda" = false WHERE "comprovante_antes_venda" = true AND "status" IN ('rascunho', 'aberto');
