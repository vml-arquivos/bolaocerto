import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateNested } from 'class-validator';
import { BANK_MODALITIES, MAX_BANK_BATCH } from './numbers.rules';

export class GenerateBankDto {
  @IsIn(BANK_MODALITIES) modalidade!: string;
  @IsInt() @Min(1) @Max(MAX_BANK_BATCH) quantidade!: number;
  @IsInt() @Min(1) @Max(100) dezenas!: number;
  @IsOptional() @IsIn(['equilibrado', 'quentes', 'atrasados', 'misto', 'aleatorio']) estrategia?: 'equilibrado' | 'quentes' | 'atrasados' | 'misto' | 'aleatorio';
  @IsOptional() @IsString() @MaxLength(80) @Matches(/^[0-9, ]*$/) fixos?: string;
  @IsOptional() @IsString() @MaxLength(80) @Matches(/^[0-9, ]*$/) excluir?: string;
  @IsOptional() @IsString() @MaxLength(80) rotulo?: string;
  /** false: só mostra os jogos, sem guardar. */
  @IsOptional() @IsBoolean() salvar?: boolean;
}

export class AddBankDto {
  @IsIn(BANK_MODALITIES) modalidade!: string;
  /** Um jogo por linha. */
  @IsString() @MaxLength(20000) jogos!: string;
  @IsOptional() @IsString() @MaxLength(80) rotulo?: string;
}

export class UsedGameDto {
  @IsArray() @ArrayMaxSize(100) @IsInt({ each: true }) numeros!: number[];
}
export class MarkUsedDto {
  @IsIn(BANK_MODALITIES) modalidade!: string;
  @IsArray() @ArrayMaxSize(MAX_BANK_BATCH) @ValidateNested({ each: true }) @Type(() => UsedGameDto) jogos!: UsedGameDto[];
  @IsOptional() @IsUUID() bolaoId?: string;
}

export class ListBankQueryDto {
  @IsOptional() @IsIn(BANK_MODALITIES) modalidade?: string;
  @IsOptional() @IsIn(['ia', 'manual', 'bolao']) origem?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(100) dezenas?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(200) pageSize?: number;
  @IsOptional() @IsString() @MaxLength(80) busca?: string;
  /** true: só os que ainda não foram usados em nenhum bolão. */
  @IsOptional() @IsIn(['true', 'false']) semUso?: string;
}
