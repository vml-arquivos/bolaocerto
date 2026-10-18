-- Concursos cujo prazo (cutoff) já passou não podem permanecer "abertos".
-- Corrige o legado criado pelo sincronizador como "próximo concurso" e nunca fechado.
UPDATE "concursos" SET "status" = 'fechado' WHERE "status" = 'aberto' AND "cutoff_at" <= NOW();
