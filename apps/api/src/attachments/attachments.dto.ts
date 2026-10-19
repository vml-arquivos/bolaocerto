import { Transform } from 'class-transformer';
import { IsBoolean, IsEnum, IsOptional, IsString, IsUUID, MaxLength } from 'class-validator';

export const ATTACHMENT_TYPES = ['comprovante_aposta', 'jogos_registrados', 'recibo_cota', 'outro'] as const;
export type AttachmentType = (typeof ATTACHMENT_TYPES)[number];

/** Lê o valor ORIGINAL do formulário: a conversão implícita do ValidationPipe transformaria o texto "false" em true. */
const toBool = ({ obj, key, value }: { obj: Record<string, unknown>; key: string; value: unknown }) => rawBool(obj?.[key] ?? value);
const rawBool = (value: unknown) => (value === true || value === 'true' || value === '1' || value === 'on' ? true : value === false || value === 'false' || value === '0' ? false : value);

/** Campos que acompanham o arquivo (multipart: tudo chega como texto). */
export class UploadAttachmentDto {
  @IsEnum(ATTACHMENT_TYPES, { message: 'Escolha o tipo do arquivo.' })
  tipo!: AttachmentType;

  /** Só para recibo individual: a cota a que o arquivo pertence. */
  @IsOptional() @IsUUID()
  cotaId?: string;

  @IsOptional() @IsString() @MaxLength(200)
  descricao?: string;

  @IsOptional() @Transform(toBool) @IsBoolean()
  visivelParticipantes?: boolean;
}

export class UpdateAttachmentDto {
  @IsOptional() @Transform(toBool) @IsBoolean()
  visivelParticipantes?: boolean;

  @IsOptional() @IsString() @MaxLength(200)
  descricao?: string;
}
