import { ArrayMaxSize, IsArray, IsOptional, IsString, IsUrl, MaxLength } from 'class-validator';

export class RegisterPoolDto {
  /** Opcional quando o comprovante foi enviado como arquivo no próprio bolão. */
  @IsOptional() @IsUrl({ protocols: ['https'], require_protocol: true })
  comprovanteUrl?: string;

  /** Número/código do bilhete na CAIXA (opcional): aparece na página pública do bolão como prova do registro. */
  @IsOptional() @IsString() @MaxLength(80)
  codigoBilhete?: string;

  /** Jogos como estão no comprovante (um array de números por jogo). O registro só passa se bater com os jogos do bolão. */
  @IsOptional() @IsArray() @ArrayMaxSize(200) @IsArray({ each: true })
  jogosConferidos?: number[][];
}
