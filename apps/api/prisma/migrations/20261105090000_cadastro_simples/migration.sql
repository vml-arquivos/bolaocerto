-- Cadastro simples: a data de nascimento deixa de ser obrigatória (vale a declaração de maioridade).
ALTER TABLE "usuarios" ALTER COLUMN "data_nascimento" DROP NOT NULL;
