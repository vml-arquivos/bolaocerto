CREATE EXTENSION IF NOT EXISTS btree_gist;
CREATE TABLE precos_loteria (
 id UUID PRIMARY KEY DEFAULT gen_random_uuid(), modalidade VARCHAR(30) NOT NULL,
 chave VARCHAR(30) NOT NULL, valor_centavos INTEGER NOT NULL CHECK (valor_centavos > 0),
 fonte TEXT NOT NULL, verificado_em TIMESTAMP(3) NOT NULL,
 vigente_desde TIMESTAMP(3) NOT NULL, vigente_ate TIMESTAMP(3),
 CHECK (vigente_ate IS NULL OR vigente_ate > vigente_desde),
 UNIQUE (modalidade, chave, vigente_desde),
 EXCLUDE USING gist (modalidade WITH =, chave WITH =, tsrange(vigente_desde, vigente_ate, '[)') WITH &&)
);
CREATE INDEX precos_loteria_lookup ON precos_loteria(modalidade, chave, vigente_ate);
ALTER TABLE boloes ADD COLUMN precificacao JSONB;
ALTER TABLE jogos_bolao ADD COLUMN selecao JSONB, ADD COLUMN preco_snapshot JSONB;
ALTER TABLE notificacoes ADD COLUMN tentativas INTEGER NOT NULL DEFAULT 0,
 ADD COLUMN proxima_tentativa_em TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
 ADD COLUMN lease_ate TIMESTAMP(3), ADD COLUMN lease_token UUID, ADD COLUMN ultimo_erro TEXT;
CREATE INDEX notificacoes_delivery ON notificacoes(enviado_em, proxima_tentativa_em, lease_ate);
