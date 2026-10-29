ALTER TABLE usuarios ADD COLUMN desativado_em TIMESTAMP(3);
CREATE INDEX usuarios_desativado_em_criado_em_idx ON usuarios(desativado_em, criado_em);
