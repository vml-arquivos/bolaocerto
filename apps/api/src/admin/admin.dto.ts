import { IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min, MinLength } from 'class-validator';

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

export class CreateManagedUserDto {
  @IsString()
  @Length(2, 150)
  nome!: string;

  @IsString()
  @Length(11, 11)
  cpf!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  telefone?: string;

  @IsDateString()
  dataNascimento!: string;

  @IsString()
  @MinLength(12)
  senha!: string;

  @IsOptional()
  @IsEnum(['cotista', 'afiliado'])
  papel?: 'cotista' | 'afiliado';

  @IsOptional()
  @IsUUID()
  parentAfiliadoId?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  comissaoPadraoPct?: number;
}

export class CreateInviteDto {
  @IsEnum(['usuario', 'afiliado'])
  tipo!: 'usuario' | 'afiliado';

  @IsOptional()
  @IsEmail()
  emailDestino?: string;

  @IsOptional()
  @IsUUID()
  afiliadoOrigemId?: string;

  @IsOptional()
  @IsDateString()
  expiraEm?: string;
}

export class CreateGroupDto {
  @IsString()
  @Length(2, 120)
  nome!: string;

  @IsString()
  @Length(3, 140)
  slug!: string;

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsUUID()
  afiliadoId?: string;
}

export class UpdateAffiliateNetworkDto {
  @IsOptional()
  @IsUUID()
  parentAfiliadoId?: string | null;
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
  @IsEnum(['cotista', 'afiliado', 'admin'])
  papel!: 'cotista' | 'afiliado' | 'admin';
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
