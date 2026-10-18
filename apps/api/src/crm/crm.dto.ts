import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsDateString, IsIn, IsInt, IsOptional, IsString, IsUUID, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';

export const SEGMENTS = ['vip', 'recorrente', 'novo', 'inativo', 'sem_compra', 'inadimplente'] as const;

export class CrmListQueryDto {
  @IsOptional() @IsString() @MaxLength(80) busca?: string;
  @IsOptional() @IsIn(SEGMENTS) segmento?: (typeof SEGMENTS)[number];
  @IsOptional() @IsIn(['diamante', 'ouro', 'prata', 'bronze']) nivel?: string;
  @IsOptional() @IsIn(['gasto', 'cotas', 'ultima', 'boloes', 'nome']) ordenar?: 'gasto' | 'cotas' | 'ultima' | 'boloes' | 'nome';
  @IsOptional() @Transform(({ value }) => (value === undefined ? undefined : Number(value))) @IsInt() @Min(1) pagina?: number;
  @IsOptional() @Transform(({ value }) => (value === undefined ? undefined : Number(value))) @IsInt() @Min(1) @Max(100) porPagina?: number;
  @IsOptional() @IsIn(['json', 'csv', 'xlsx', 'pdf']) formato?: 'json' | 'csv' | 'xlsx' | 'pdf';
}

export class CrmNoteDto {
  @IsString() @MinLength(2) @MaxLength(2000) texto!: string;
}

export class CrmProfileDto {
  @IsOptional() @IsArray() @ArrayMaxSize(10) @IsString({ each: true }) @MaxLength(30, { each: true }) etiquetas?: string[];
  @IsOptional() @ValidateIf((_dto: CrmProfileDto, value: unknown) => value !== null) @IsDateString() proximoContatoEm?: string | null;
}

export class CrmIdParam {
  @IsUUID() id!: string;
}
