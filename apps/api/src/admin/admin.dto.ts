import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsDateString, IsEmail, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUrl, IsUUID, Length, Matches, Max, MaxLength, Min, MinLength } from 'class-validator';
import { NEW_PASSWORD_MIN_LENGTH, NEW_PASSWORD_MAX_LENGTH, NEW_PASSWORD_MESSAGE, NEW_PASSWORD_PATTERN } from '../auth/password-policy';

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
  @Length(NEW_PASSWORD_MIN_LENGTH, NEW_PASSWORD_MAX_LENGTH, { message: NEW_PASSWORD_MESSAGE })
  @Matches(NEW_PASSWORD_PATTERN, { message: NEW_PASSWORD_MESSAGE })
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
  @IsEnum(['usuario', 'afiliado', 'operacao', 'admin'])
  tipo!: 'usuario' | 'afiliado' | 'operacao' | 'admin';

  @IsOptional()
  @IsEmail()
  emailDestino?: string;

  @IsOptional()
  @IsUUID()
  afiliadoOrigemId?: string;

  /** Convite que já coloca a pessoa dentro de um grupo do afiliado. */
  @IsOptional()
  @IsUUID()
  grupoId?: string;

  @IsOptional()
  @IsDateString()
  expiraEm?: string;

  /** Comissão do afiliado (%) definida pelo admin; obrigatória no convite de afiliado. */
  @IsOptional()
  @Type(() => Number)
  @Min(0)
  @Max(100)
  comissaoPct?: number;
}

/** O admin autoriza pessoas a mais na conta do grupo (além das que entraram pelo site). */
export class UpdateGroupCapacityDto {
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100_000)
  capacidadeExtra!: number;
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

  /** Filtro de tipo na lista de convites. */
  @IsOptional()
  @IsIn(['usuario', 'afiliado', 'operacao', 'admin'])
  tipo?: string;

  /** Filtro de papel na lista de usuários: cotista, afiliado, admin, operacao ou equipe (admin + operação). */
  @IsOptional()
  @IsIn(['cotista', 'afiliado', 'admin', 'operacao', 'equipe'])
  papel?: string;
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

  /** Aceitos (e ignorados) para não derrubar o painel se um navegador ainda tiver a versão antiga do site em cache. */
  @IsOptional() page?: unknown;
  @IsOptional() pageSize?: unknown;
  @IsOptional() busca?: unknown;
  @IsOptional() status?: unknown;
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
  @IsEnum(['cotista', 'afiliado', 'operacao', 'admin'], { message: 'Perfil de acesso inválido.' })
  papel!: 'cotista' | 'afiliado' | 'operacao' | 'admin';
}

export class UpdateUserKycDto {
  @IsEnum(['nao_iniciado', 'pendente', 'aprovado', 'reprovado'])
  statusKyc!: 'nao_iniciado' | 'pendente' | 'aprovado' | 'reprovado';
}

export class OperationReceiptDto {
  /** Aparece publicamente na página do bolão: só https (bloqueia javascript:, data: etc.). */
  @IsOptional()
  @IsUrl({ protocols: ['https'], require_protocol: true }, { message: 'Informe o link do comprovante começando com https://' })
  comprovanteUrl?: string;

  @IsOptional()
  @IsString()
  @MaxLength(80)
  codigoBilhete?: string;

  @IsOptional()
  @IsString()
  hashArquivo?: string;

  @IsOptional()
  @IsString()
  observacao?: string;

  /** Jogos como estão no comprovante (um array de números por jogo). O registro só passa se bater com os jogos do bolão. */
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(200)
  @IsArray({ each: true })
  jogosConferidos?: number[][];
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
