import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsISO8601, IsNumber, IsOptional, IsString, IsUUID, Length, Max, Min } from 'class-validator';

export class CouponBaseDto {
  @IsOptional() @IsString() @Length(0, 200) descricao?: string;
  /** Teto de desconto por compra, em reais. */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100_000) descontoMaximoReais?: number | null;
  /** Compra mínima, em reais. */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1_000_000) valorMinimoReais?: number | null;
  @IsOptional() @IsBoolean() automatico?: boolean;
  @IsOptional() @IsISO8601() inicioEm?: string | null;
  @IsOptional() @IsISO8601() fimEm?: string | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(10_000_000) limiteTotal?: number | null;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(1000) limitePorCliente?: number | null;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) grupoIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(2000) @IsUUID('all', { each: true }) usuarioIds?: string[];
}

export class CreateCouponDto extends CouponBaseDto {
  /** Sem código, o sistema cria um. */
  @IsOptional() @IsString() @Length(3, 40) codigo?: string;
  @IsIn(['percentual', 'valor']) tipo!: 'percentual' | 'valor';
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100_000) valor!: number;
}

export class UpdateCouponDto extends CouponBaseDto {
  @IsOptional() @IsBoolean() ativo?: boolean;
}

export class CampaignBaseDto {
  @IsOptional() @IsString() @Length(3, 120) nome?: string;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100) percentual?: number;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(1_000_000) valorMinimoReais?: number | null;
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100_000) maximoPorCompraReais?: number | null;
  /** Quanto a campanha pode dar de cashback no total, em reais. Sem isso, não há teto de orçamento. */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(10_000_000) orcamentoReais?: number | null;
  @IsOptional() @IsBoolean() ativa?: boolean;
  @IsOptional() @IsISO8601() inicioEm?: string | null;
  @IsOptional() @IsISO8601() fimEm?: string | null;
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsUUID('all', { each: true }) grupoIds?: string[];
  @IsOptional() @IsArray() @ArrayMaxSize(2000) @IsUUID('all', { each: true }) usuarioIds?: string[];
}

export class CreateCampaignDto extends CampaignBaseDto {
  @IsString() @Length(3, 120) declare nome: string;
  @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0.01) @Max(100) declare percentual: number;
}
