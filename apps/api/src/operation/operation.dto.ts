import { IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class RegisterPoolDto {
  /** Opcional quando o comprovante foi enviado como arquivo no próprio bolão. */
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true })
  comprovanteUrl?: string;

  /** Número/código do bilhete na CAIXA (opcional): aparece na página pública do bolão como prova do registro. */
  @IsOptional() @IsString() @MaxLength(80)
  codigoBilhete?: string;
}
