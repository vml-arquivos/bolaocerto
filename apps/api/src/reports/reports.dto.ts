import { IsIn, IsOptional, IsUUID, Matches } from 'class-validator';

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export class ReportQueryDto {
  @IsOptional() @Matches(DATE, { message: 'Use a data no formato AAAA-MM-DD.' }) de?: string;
  @IsOptional() @Matches(DATE, { message: 'Use a data no formato AAAA-MM-DD.' }) ate?: string;
  @IsOptional() @IsIn(['reservada', 'paga', 'registrada', 'apurada', 'premiada', 'cancelada', 'estornada']) status?: string;
  @IsOptional() @IsIn(['pendente', 'confirmado', 'falhou', 'estornado', 'sem_pagamento']) statusPagamento?: string;
  @IsOptional() @IsIn(['online', 'manual']) origem?: string;
  @IsOptional() @IsIn(['aguardando', 'aguardando_certificado', 'emitida', 'erro', 'cancelada']) statusNota?: string;
  @IsOptional() @IsIn(['pix', 'boleto', 'cartao', 'pix_automatico', 'manual']) metodo?: string;
  @IsOptional() @IsUUID() bolaoId?: string;
  @IsOptional() @IsUUID() afiliadoId?: string;
  @IsOptional() @IsIn(['json', 'csv', 'xlsx', 'pdf']) formato?: 'json' | 'csv' | 'xlsx' | 'pdf';
  /** Ordem das linhas (tela e arquivos): por bolão e nome, por nome (A-Z), data mais recente ou data mais antiga. */
  @IsOptional() @IsIn(['bolao', 'nome', 'data', 'data_asc']) ordem?: 'bolao' | 'nome' | 'data' | 'data_asc';
}
