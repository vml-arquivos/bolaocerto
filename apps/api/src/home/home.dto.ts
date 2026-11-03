import { Type } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsIn, IsOptional, IsString, IsUUID, Matches, MaxLength, ValidateNested } from 'class-validator';
import { MAX_DESTAQUES, MAX_SLIDES } from './home.config';

const SAFE_LINK = /^(\/(?!\/)[^\s]*|https:\/\/[^\s]+)$/i;

export class HomeSlideDto {
  @IsString() @MaxLength(40) id!: string;
  @IsIn(['bolao', 'livre']) tipo!: 'bolao' | 'livre';
  @IsBoolean() ativo!: boolean;
  @IsOptional() @IsUUID() bolaoId?: string;
  @IsOptional() @IsString() @MaxLength(30) modalidade?: string;
  @IsString() @MaxLength(80) titulo!: string;
  @IsOptional() @IsString() @MaxLength(40) etiqueta?: string;
  @IsOptional() @Matches(SAFE_LINK, { message: 'Imagem inválida: envie um arquivo ou use um endereço https://.' }) @MaxLength(200) imagem?: string;
  @IsOptional() @IsString() @MaxLength(200) subtitulo?: string;
  @IsOptional() @IsString() @MaxLength(30) botao?: string;
  @IsOptional() @Matches(SAFE_LINK, { message: 'Use um caminho do site (ex.: /boloes) ou um endereço que comece com https://.' }) @MaxLength(200) link?: string;
}
export class HomeSecoesDto {
  @IsBoolean() numeros!: boolean;
  @IsBoolean() modalidades!: boolean;
  @IsBoolean() resultados!: boolean;
  @IsBoolean() sorteados!: boolean;
  @IsBoolean() encerrados!: boolean;
  @IsBoolean() concursos!: boolean;
  @IsBoolean() comoFunciona!: boolean;
  @IsBoolean() duvidas!: boolean;
}
export class SaveHomeDto {
  @IsArray() @ArrayMaxSize(MAX_SLIDES) @ValidateNested({ each: true }) @Type(() => HomeSlideDto) slides!: HomeSlideDto[];
  @IsArray() @ArrayMaxSize(MAX_DESTAQUES) @IsUUID('all', { each: true }) destaques!: string[];
  @ValidateNested() @Type(() => HomeSecoesDto) secoes!: HomeSecoesDto;
}
