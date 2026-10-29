import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsEnum, IsInt, IsNumber, IsOptional, IsObject, ArrayMaxSize, IsPositive, IsString, IsUUID, Max, Min, ValidateIf, ValidateNested } from 'class-validator';

export class PoolGameDto {
  @IsInt()
  @Min(1)
  ordem!: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  numeros!: number[];

  @IsOptional()
  @IsInt()
  @Min(1)
  quantidadeDezenas?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  custo?: number;

  @IsOptional()
  @IsObject()
  selecao?: { trevos?: number[]; colunas?: number[][]; mesSorte?: number; timeCoracao?: string };

}

export class CreatePoolDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  totalCotadoCentavos?: number;

  @IsOptional()
  @IsBoolean()
  precificacaoAutomatica?: boolean;

  @IsUUID()
  concursoId!: string;

  @IsUUID()
  grupoId!: string;

  @IsArray()
  @IsInt({ each: true })
  numerosApostados!: number[];

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PoolGameDto)
  jogos?: PoolGameDto[];

  @IsOptional()
  @IsBoolean()
  cotasIlimitadas?: boolean;

  @ValidateIf((dto: CreatePoolDto) => !dto.cotasIlimitadas)
  @IsInt()
  @Min(1)
  totalCotas?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valorCota!: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(35)
  taxaAdministracaoPct!: number;

  @IsEnum(['mandato', 'loterica_parceira'])
  modeloOperacional!: 'mandato' | 'loterica_parceira';

  /** Bolão condicional: cotas só são liberadas quando o prêmio estimado atingir este valor (R$). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100_000_000_000)
  premioMinimoLiberacao?: number;

  @IsOptional()
  @IsUUID()
  lotericaParceiraId?: string;
}

export class UpdatePoolDto {
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  numerosApostados?: number[];

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PoolGameDto)
  jogos?: PoolGameDto[];

  @IsOptional()
  @IsBoolean()
  cotasIlimitadas?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  totalCotas?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valorCota?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(35)
  taxaAdministracaoPct?: number;

  /** Use null para remover a condição de liberação. */
  @IsOptional()
  @ValidateIf((_dto: UpdatePoolDto, value: unknown) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100_000_000_000)
  premioMinimoLiberacao?: number | null;
}
