ALTER TABLE mandatos ADD COLUMN texto_snapshot TEXT, ADD COLUMN versao VARCHAR(40), ADD COLUMN pedido_snapshot JSONB;
CREATE TABLE aceites_legais (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), usuario_id UUID NOT NULL REFERENCES usuarios(id),
 tipo VARCHAR(30) NOT NULL, hash VARCHAR(64) NOT NULL, versao VARCHAR(40) NOT NULL,
 texto TEXT NOT NULL, ip VARCHAR(64) NOT NULL, user_agent TEXT, aceito_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX aceites_legais_usuario_id_tipo_hash_key ON aceites_legais(usuario_id, tipo, hash);

-- Existing pools keep their original mandate workflow; new lots require prior proof.
ALTER TABLE boloes ADD COLUMN comprovante_antes_venda BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE boloes ALTER COLUMN comprovante_antes_venda SET DEFAULT true;
