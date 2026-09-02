import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsEnum, IsInt, IsNumber, IsOptional, IsPositive, IsString, IsUUID, Max, Min, ValidateNested } from 'class-validator';

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
}

export class CreatePoolDto {
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
  @ValidateNested({ each: true })
  @Type(() => PoolGameDto)
  jogos?: PoolGameDto[];

  @IsInt()
  @Min(1)
  totalCotas!: number;

  @IsPositive()
  valorCota!: number;

  @Min(0)
  @Max(35)
  taxaAdministracaoPct!: number;

  @IsEnum(['mandato', 'loterica_parceira'])
  modeloOperacional!: 'mandato' | 'loterica_parceira';

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
  @ValidateNested({ each: true })
  @Type(() => PoolGameDto)
  jogos?: PoolGameDto[];

  @IsOptional()
  @IsInt()
  @Min(1)
  totalCotas?: number;

  @IsOptional()
  @IsPositive()
  valorCota?: number;

  @IsOptional()
  @Min(0)
  @Max(35)
  taxaAdministracaoPct?: number;
}
