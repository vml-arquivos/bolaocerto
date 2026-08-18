import { IsArray, IsEnum, IsInt, IsOptional, IsPositive, IsString, IsUUID, Max, Min } from 'class-validator';

export class CreatePoolDto {
  @IsUUID()
  concursoId!: string;

  @IsUUID()
  grupoId!: string;

  @IsArray()
  @IsInt({ each: true })
  numerosApostados!: number[];

  @IsInt()
  @Min(1)
  totalCotas!: number;

  @IsPositive()
  valorCota!: number;

  @IsPositive()
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
  @IsInt()
  @Min(1)
  totalCotas?: number;

  @IsOptional()
  @IsPositive()
  valorCota?: number;

  @IsOptional()
  @IsPositive()
  @Max(35)
  taxaAdministracaoPct?: number;

  @IsOptional()
  @IsString()
  descricao?: string;
}
