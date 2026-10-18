import { Transform, Type } from 'class-transformer';
import { IsIn, IsOptional, IsString, IsUrl, Matches, MaxLength, MinLength, ValidateNested } from 'class-validator';

export const UFS = ['AC', 'AL', 'AP', 'AM', 'BA', 'CE', 'DF', 'ES', 'GO', 'MA', 'MT', 'MS', 'MG', 'PA', 'PB', 'PR', 'PE', 'PI', 'RJ', 'RN', 'RS', 'RO', 'RR', 'SC', 'SP', 'SE', 'TO'] as const;

const trim = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim() : value);
const digits = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.replace(/\D/g, '') : value);
const upper = ({ value }: { value: unknown }) => (typeof value === 'string' ? value.trim().toUpperCase() : value);

export class AddressDto {
  @Transform(digits) @Matches(/^\d{8}$/, { message: 'Informe o CEP com 8 dígitos.' }) cep!: string;
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(120) logradouro!: string;
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(20) numero!: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(80) complemento?: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(80) bairro!: string;
  @Transform(trim) @IsString() @MinLength(2) @MaxLength(80) cidade!: string;
  @Transform(upper) @IsIn(UFS as unknown as string[], { message: 'UF inválida.' }) uf!: string;
}

export class EmitNoteDto {
  @IsOptional() @ValidateNested() @Type(() => AddressDto) endereco?: AddressDto;
}

export class ManualNoteDto {
  @Transform(trim) @IsString() @MinLength(1) @MaxLength(40) numero!: string;
  @IsOptional() @IsUrl({ require_protocol: true, protocols: ['https', 'http'] }) @MaxLength(500) pdfUrl?: string;
  @IsOptional() @Transform(trim) @IsString() @MaxLength(300) observacao?: string;
}

export class CancelNoteDto {
  @Transform(trim) @IsString() @MinLength(3) @MaxLength(300) motivo!: string;
}

export class NoteQueryDto {
  @IsOptional() @IsIn(['aguardando', 'aguardando_certificado', 'emitida', 'erro', 'cancelada']) status?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) de?: string;
  @IsOptional() @Matches(/^\d{4}-\d{2}-\d{2}$/) ate?: string;
}
