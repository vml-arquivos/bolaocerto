-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateEnum
CREATE TYPE "PapelUsuario" AS ENUM ('cotista', 'afiliado', 'admin', 'operacao');

-- CreateEnum
CREATE TYPE "StatusKyc" AS ENUM ('nao_iniciado', 'pendente', 'aprovado', 'reprovado');

-- CreateEnum
CREATE TYPE "TipoOrganizador" AS ENUM ('admin', 'afiliado');

-- CreateEnum
CREATE TYPE "ModeloOperacional" AS ENUM ('mandato', 'loterica_parceira');

-- CreateEnum
CREATE TYPE "StatusBolao" AS ENUM ('rascunho', 'aberto', 'fechado', 'registrado', 'apurado', 'cancelado');

-- CreateEnum
CREATE TYPE "StatusCota" AS ENUM ('reservada', 'paga', 'registrada', 'apurada', 'premiada', 'cancelada', 'estornada');

-- CreateEnum
CREATE TYPE "MetodoPagamento" AS ENUM ('pix', 'cartao', 'boleto');

-- CreateEnum
CREATE TYPE "StatusPagamento" AS ENUM ('pendente', 'confirmado', 'falhou', 'estornado');

-- CreateEnum
CREATE TYPE "StatusComissao" AS ENUM ('pendente', 'paga', 'cancelada');

-- CreateEnum
CREATE TYPE "TipoGrupo" AS ENUM ('oficial', 'afiliado');

-- CreateTable
CREATE TABLE "usuarios" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(150) NOT NULL,
    "cpf" VARCHAR(11) NOT NULL,
    "email" VARCHAR(180) NOT NULL,
    "telefone" VARCHAR(20),
    "data_nascimento" DATE NOT NULL,
    "senha_hash" TEXT NOT NULL,
    "papel" "PapelUsuario" NOT NULL DEFAULT 'cotista',
    "status_kyc" "StatusKyc" NOT NULL DEFAULT 'nao_iniciado',
    "chave_pix_recebimento" VARCHAR(140),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "atualizado_em" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "usuarios_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "kyc_documentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "tipo_documento" VARCHAR(30) NOT NULL,
    "arquivo_url" TEXT NOT NULL,
    "status" "StatusKyc" NOT NULL DEFAULT 'pendente',
    "revisado_por" UUID,
    "revisado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "kyc_documentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "lotericas_parceiras" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "razao_social" VARCHAR(180) NOT NULL,
    "cnpj" VARCHAR(14) NOT NULL,
    "codigo_caixa" VARCHAR(30),
    "cidade" VARCHAR(120) NOT NULL,
    "uf" CHAR(2) NOT NULL,
    "percentual_repasse" DECIMAL(5,2) NOT NULL DEFAULT 0,
    "status_contrato" VARCHAR(20) NOT NULL DEFAULT 'ativo',
    "usuario_operacional_id" UUID,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "lotericas_parceiras_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "config_loteria" (
    "modalidade" VARCHAR(30) NOT NULL,
    "nome_exibicao" VARCHAR(60) NOT NULL,
    "valor_minimo_cota" DECIMAL(10,2) NOT NULL,
    "min_cotas_bolao" INTEGER NOT NULL,
    "max_cotas_bolao" INTEGER NOT NULL,
    "taxa_administracao_teto_pct" DECIMAL(5,2) NOT NULL DEFAULT 35,
    "horario_corte_local" VARCHAR(8) NOT NULL,
    "dias_semana_sorteio" INTEGER[],

    CONSTRAINT "config_loteria_pkey" PRIMARY KEY ("modalidade")
);

-- CreateTable
CREATE TABLE "concursos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "modalidade" VARCHAR(30) NOT NULL,
    "numero_concurso" INTEGER NOT NULL,
    "data_sorteio" TIMESTAMP(3) NOT NULL,
    "cutoff_at" TIMESTAMP(3) NOT NULL,
    "valor_estimado_premio" DECIMAL(14,2),
    "acumulado" BOOLEAN NOT NULL DEFAULT false,
    "status" VARCHAR(20) NOT NULL DEFAULT 'aberto',
    "fonte_sincronizacao" VARCHAR(20),
    "sincronizado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "concursos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "resultados" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "concurso_id" UUID NOT NULL,
    "numeros_sorteados" INTEGER[],
    "lista_rateio_premio" JSONB NOT NULL,
    "apurado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "resultados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "afiliados" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "codigo_afiliado" VARCHAR(20) NOT NULL,
    "status_aprovacao" VARCHAR(20) NOT NULL DEFAULT 'pendente',
    "comissao_padrao_pct" DECIMAL(5,2) NOT NULL DEFAULT 10,
    "chave_pix_repasse" VARCHAR(140),
    "aprovado_por" UUID,
    "aprovado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "afiliados_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "grupos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "nome" VARCHAR(120) NOT NULL,
    "slug" VARCHAR(140) NOT NULL,
    "tipo" "TipoGrupo" NOT NULL,
    "afiliado_id" UUID,
    "imagem_capa_url" TEXT,
    "descricao" TEXT,
    "criado_por" UUID,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "grupos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "boloes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "concurso_id" UUID NOT NULL,
    "grupo_id" UUID NOT NULL,
    "criado_por" UUID NOT NULL,
    "tipo_organizador" "TipoOrganizador" NOT NULL,
    "numeros_apostados" INTEGER[],
    "total_cotas" INTEGER NOT NULL,
    "cotas_vendidas" INTEGER NOT NULL DEFAULT 0,
    "valor_cota" DECIMAL(10,2) NOT NULL,
    "taxa_administracao_pct" DECIMAL(5,2) NOT NULL,
    "modelo_operacional" "ModeloOperacional" NOT NULL,
    "loterica_parceira_id" UUID,
    "status" "StatusBolao" NOT NULL DEFAULT 'aberto',
    "comprovante_url" TEXT,
    "registrado_em" TIMESTAMP(3),
    "teve_ganhador" BOOLEAN NOT NULL DEFAULT false,
    "editado_por" UUID,
    "editado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "boloes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cotas" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "bolao_id" UUID NOT NULL,
    "comprador_id" UUID NOT NULL,
    "titular_cpf" VARCHAR(11) NOT NULL,
    "titular_nome" VARCHAR(150) NOT NULL,
    "quantidade" INTEGER NOT NULL DEFAULT 1,
    "valor_pago" DECIMAL(10,2),
    "status" "StatusCota" NOT NULL DEFAULT 'reservada',
    "reservada_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expira_reserva_em" TIMESTAMP(3),
    "comprovante_individual_url" TEXT,
    "afiliado_referencia_id" UUID,
    "faixa_premio" VARCHAR(60),
    "valor_premio" DECIMAL(14,2),
    "premio_notificado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "cotas_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mandatos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cota_id" UUID NOT NULL,
    "usuario_id" UUID NOT NULL,
    "texto_hash" VARCHAR(64) NOT NULL,
    "ip_aceite" VARCHAR(64) NOT NULL,
    "user_agent" TEXT,
    "aceito_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "mandatos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "pagamentos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "cota_id" UUID NOT NULL,
    "metodo" "MetodoPagamento" NOT NULL,
    "valor_bruto" DECIMAL(10,2) NOT NULL,
    "valor_taxa_admin" DECIMAL(10,2) NOT NULL,
    "valor_comissao_afiliado" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "valor_custo_bilhete" DECIMAL(10,2) NOT NULL,
    "status" "StatusPagamento" NOT NULL DEFAULT 'pendente',
    "psp_provedor" VARCHAR(30) NOT NULL,
    "psp_transaction_id" VARCHAR(100),
    "qr_code_pix" TEXT,
    "confirmado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "pagamentos_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "comissoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "afiliado_id" UUID NOT NULL,
    "cota_id" UUID NOT NULL,
    "valor" DECIMAL(10,2) NOT NULL,
    "status" "StatusComissao" NOT NULL DEFAULT 'pendente',
    "repassado_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "comissoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "notificacoes" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "usuario_id" UUID NOT NULL,
    "canal" VARCHAR(20) NOT NULL,
    "tipo" VARCHAR(40) NOT NULL,
    "payload" JSONB NOT NULL,
    "enviado_em" TIMESTAMP(3),
    "lido_em" TIMESTAMP(3),
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "notificacoes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "auditoria_eventos" (
    "id" UUID NOT NULL DEFAULT gen_random_uuid(),
    "entidade" VARCHAR(40) NOT NULL,
    "entidade_id" UUID NOT NULL,
    "evento" VARCHAR(60) NOT NULL,
    "ator_id" UUID,
    "payload_antes" JSONB,
    "payload_depois" JSONB,
    "criado_em" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "auditoria_eventos_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_cpf_key" ON "usuarios"("cpf");

-- CreateIndex
CREATE UNIQUE INDEX "usuarios_email_key" ON "usuarios"("email");

-- CreateIndex
CREATE UNIQUE INDEX "lotericas_parceiras_cnpj_key" ON "lotericas_parceiras"("cnpj");

-- CreateIndex
CREATE UNIQUE INDEX "concursos_modalidade_numero_concurso_key" ON "concursos"("modalidade", "numero_concurso");

-- CreateIndex
CREATE UNIQUE INDEX "resultados_concurso_id_key" ON "resultados"("concurso_id");

-- CreateIndex
CREATE UNIQUE INDEX "afiliados_usuario_id_key" ON "afiliados"("usuario_id");

-- CreateIndex
CREATE UNIQUE INDEX "afiliados_codigo_afiliado_key" ON "afiliados"("codigo_afiliado");

-- CreateIndex
CREATE UNIQUE INDEX "grupos_slug_key" ON "grupos"("slug");

-- CreateIndex
CREATE INDEX "boloes_concurso_id_status_idx" ON "boloes"("concurso_id", "status");

-- CreateIndex
CREATE INDEX "cotas_bolao_id_status_idx" ON "cotas"("bolao_id", "status");

-- CreateIndex
CREATE INDEX "cotas_comprador_id_status_idx" ON "cotas"("comprador_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "mandatos_cota_id_key" ON "mandatos"("cota_id");

-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_cota_id_key" ON "pagamentos"("cota_id");

-- CreateIndex
CREATE UNIQUE INDEX "pagamentos_psp_provedor_psp_transaction_id_key" ON "pagamentos"("psp_provedor", "psp_transaction_id");

-- CreateIndex
CREATE UNIQUE INDEX "comissoes_cota_id_key" ON "comissoes"("cota_id");

-- CreateIndex
CREATE INDEX "auditoria_eventos_entidade_entidade_id_idx" ON "auditoria_eventos"("entidade", "entidade_id");

-- AddForeignKey
ALTER TABLE "kyc_documentos" ADD CONSTRAINT "kyc_documentos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "kyc_documentos" ADD CONSTRAINT "kyc_documentos_revisado_por_fkey" FOREIGN KEY ("revisado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "lotericas_parceiras" ADD CONSTRAINT "lotericas_parceiras_usuario_operacional_id_fkey" FOREIGN KEY ("usuario_operacional_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "concursos" ADD CONSTRAINT "concursos_modalidade_fkey" FOREIGN KEY ("modalidade") REFERENCES "config_loteria"("modalidade") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "resultados" ADD CONSTRAINT "resultados_concurso_id_fkey" FOREIGN KEY ("concurso_id") REFERENCES "concursos"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "afiliados" ADD CONSTRAINT "afiliados_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "afiliados" ADD CONSTRAINT "afiliados_aprovado_por_fkey" FOREIGN KEY ("aprovado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grupos" ADD CONSTRAINT "grupos_afiliado_id_fkey" FOREIGN KEY ("afiliado_id") REFERENCES "afiliados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "grupos" ADD CONSTRAINT "grupos_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boloes" ADD CONSTRAINT "boloes_concurso_id_fkey" FOREIGN KEY ("concurso_id") REFERENCES "concursos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boloes" ADD CONSTRAINT "boloes_grupo_id_fkey" FOREIGN KEY ("grupo_id") REFERENCES "grupos"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boloes" ADD CONSTRAINT "boloes_criado_por_fkey" FOREIGN KEY ("criado_por") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boloes" ADD CONSTRAINT "boloes_loterica_parceira_id_fkey" FOREIGN KEY ("loterica_parceira_id") REFERENCES "lotericas_parceiras"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "boloes" ADD CONSTRAINT "boloes_editado_por_fkey" FOREIGN KEY ("editado_por") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotas" ADD CONSTRAINT "cotas_bolao_id_fkey" FOREIGN KEY ("bolao_id") REFERENCES "boloes"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotas" ADD CONSTRAINT "cotas_comprador_id_fkey" FOREIGN KEY ("comprador_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cotas" ADD CONSTRAINT "cotas_afiliado_referencia_id_fkey" FOREIGN KEY ("afiliado_referencia_id") REFERENCES "afiliados"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandatos" ADD CONSTRAINT "mandatos_cota_id_fkey" FOREIGN KEY ("cota_id") REFERENCES "cotas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mandatos" ADD CONSTRAINT "mandatos_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "pagamentos" ADD CONSTRAINT "pagamentos_cota_id_fkey" FOREIGN KEY ("cota_id") REFERENCES "cotas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_afiliado_id_fkey" FOREIGN KEY ("afiliado_id") REFERENCES "afiliados"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "comissoes" ADD CONSTRAINT "comissoes_cota_id_fkey" FOREIGN KEY ("cota_id") REFERENCES "cotas"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "notificacoes" ADD CONSTRAINT "notificacoes_usuario_id_fkey" FOREIGN KEY ("usuario_id") REFERENCES "usuarios"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "auditoria_eventos" ADD CONSTRAINT "auditoria_eventos_ator_id_fkey" FOREIGN KEY ("ator_id") REFERENCES "usuarios"("id") ON DELETE SET NULL ON UPDATE CASCADE;
