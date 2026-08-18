import { IsEmail, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

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
