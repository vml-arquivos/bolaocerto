-- Convite para a equipe: a pessoa recebe um link e faz o próprio cadastro já com o papel de operação ou de administrador.
ALTER TYPE "TipoConvite" ADD VALUE IF NOT EXISTS 'operacao';
ALTER TYPE "TipoConvite" ADD VALUE IF NOT EXISTS 'admin';
