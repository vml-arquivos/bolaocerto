import { IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class CreatePartnerLotteryDto {
  @IsString()
  @Length(2, 180)
  razaoSocial!: string;

  @IsString()
  @Length(14, 14)
  cnpj!: string;

  @IsOptional()
  @IsString()
  codigoCaixa?: string;

  @IsString()
  @Length(2, 120)
  cidade!: string;

  @IsString()
  @Length(2, 2)
  uf!: string;

  @Min(0)
  @Max(100)
  percentualRepasse!: number;

  @IsOptional()
  @IsUUID()
  usuarioOperacionalId?: string;
}

export class ApproveAffiliateDto {
  @Min(0)
  @Max(100)
  comissaoPadraoPct!: number;
}

export class CreateAffiliateDto {
  @IsOptional()
  @IsEmail()
  emailContato?: string;
}

export class AdminListQueryDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  page?: number;

  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(100)
  pageSize?: number;

  @IsOptional()
  @IsString()
  modalidade?: string;

  @IsOptional()
  @IsString()
  status?: string;

  @IsOptional()
  @IsDateString()
  de?: string;

  @IsOptional()
  @IsDateString()
  ate?: string;

  @IsOptional()
  @IsString()
  busca?: string;
}

export class DashboardQueryDto {
  @IsOptional()
  @IsEnum(['hoje', '7d', '30d', 'mes', 'custom'])
  periodo?: 'hoje' | '7d' | '30d' | 'mes' | 'custom';

  @IsOptional()
  @IsDateString()
  de?: string;

  @IsOptional()
  @IsDateString()
  ate?: string;
}

export class CreateRemittanceDto {
  @IsArray()
  @IsUUID('4', { each: true })
  comissaoIds!: string[];

  @IsOptional()
  @IsDateString()
  dataRepasse?: string;

  @IsOptional()
  @IsString()
  referencia?: string;

  @IsOptional()
  @IsString()
  comprovanteUrl?: string;

  @IsOptional()
  @IsString()
  observacao?: string;
}

export class PayRemittanceDto {
  @IsOptional()
  @IsDateString()
  dataRepasse?: string;

  @IsOptional()
  @IsString()
  referencia?: string;

  @IsOptional()
  @IsString()
  comprovanteUrl?: string;

  @IsOptional()
  @IsString()
  observacao?: string;
}

export class UpdateAffiliateCommissionDto {
  @Min(0)
  @Max(100)
  comissaoPadraoPct!: number;
}

export class UpdateUserRoleDto {
  @IsEnum(['cotista', 'afiliado', 'admin', 'operacao'])
  papel!: 'cotista' | 'afiliado' | 'admin' | 'operacao';
}

export class UpdateUserKycDto {
  @IsEnum(['nao_iniciado', 'pendente', 'aprovado', 'reprovado'])
  statusKyc!: 'nao_iniciado' | 'pendente' | 'aprovado' | 'reprovado';
}

export class OperationReceiptDto {
  @IsString()
  comprovanteUrl!: string;

  @IsOptional()
  @IsString()
  hashArquivo?: string;

  @IsOptional()
  @IsString()
  observacao?: string;
}

export class UpdateSettingsDto {
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(60)
  prazoReservaMinutos?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  comissaoPadraoPct?: number;

  @IsOptional()
  @IsBoolean()
  pagamentosHabilitados?: boolean;
}
