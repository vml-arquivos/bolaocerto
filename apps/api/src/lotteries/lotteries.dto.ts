import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsNumber, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

export class CreateManualContestDto {
  @IsString()
  modalidade!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  numeroConcurso!: number;

  /** Data do sorteio no formato AAAA-MM-DD (horário de Brasília). */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use a data no formato AAAA-MM-DD.' })
  dataSorteio!: string;

  @IsOptional()
  @IsBoolean()
  acumulado?: boolean;
}

/** Concurso de festa (Mega da Virada, São João...). Sem número oficial ainda? Deixe o número em branco. */
export class CreateFestaContestDto {
  /** Chave de um modelo pronto (ex.: mega-da-virada) ou "personalizado". */
  @IsString() @MaxLength(40)
  especial!: string;

  /** Só para "personalizado". */
  @IsOptional() @IsString() @MaxLength(30)
  modalidade?: string;

  /** Só para "personalizado": como o concurso aparece para o cliente. */
  @IsOptional() @IsString() @MaxLength(80)
  nomeEspecial?: string;

  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use a data no formato AAAA-MM-DD.' })
  dataSorteio!: string;

  /** Deixe em branco enquanto a CAIXA não divulgar o número. */
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  numeroConcurso?: number;

  /** Prêmio estimado, se já houver. */
  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000_000)
  valorEstimadoPremio?: number;
}

export class UpdateFestaContestDto {
  @IsOptional() @Type(() => Number) @IsInt() @Min(1)
  numeroConcurso?: number;

  @IsOptional() @Type(() => Number) @IsNumber({ maxDecimalPlaces: 2 }) @Min(0) @Max(100_000_000_000)
  valorEstimadoPremio?: number;
}
