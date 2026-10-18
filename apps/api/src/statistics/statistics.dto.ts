import { Transform } from 'class-transformer';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Matches, Max, MaxLength, Min } from 'class-validator';

const toInt = ({ value }: { value: unknown }) => (value === undefined || value === '' ? undefined : Number(value));

export class AnalyzeGameDto {
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(100) @IsInt({ each: true }) @Min(0, { each: true }) @Max(99, { each: true }) numeros!: number[];
}

export class ProbabilityQueryDto {
  @IsOptional() @Transform(toInt) @IsInt() @Min(1) @Max(100) dezenas?: number;
}

export class SuggestQueryDto {
  @IsOptional() @Transform(toInt) @IsInt() @Min(1) @Max(20) jogos?: number;
  @IsOptional() @Transform(toInt) @IsInt() @Min(1) @Max(100) dezenas?: number;
  @IsOptional() @IsIn(['equilibrado', 'quentes', 'atrasados', 'misto', 'aleatorio']) estrategia?: 'equilibrado' | 'quentes' | 'atrasados' | 'misto' | 'aleatorio';
  /** Números que devem entrar no jogo, separados por vírgula. */
  @IsOptional() @IsString() @MaxLength(80) @Matches(/^[0-9, ]*$/) fixos?: string;
  /** Números a evitar, separados por vírgula. */
  @IsOptional() @IsString() @MaxLength(200) @Matches(/^[0-9, ]*$/) excluir?: string;
}

export class StatsQueryDto {
  /** Janela de "recentes" para quente/frio (concursos). */
  @IsOptional() @Transform(toInt) @IsInt() @Min(5) @Max(200) janela?: number;
}

export class ImportHistoryQueryDto {
  @IsOptional() @IsString() @MaxLength(30) modalidade?: string;
  @IsOptional() @Transform(toInt) @IsInt() @Min(1) @Max(60) limite?: number;
}
