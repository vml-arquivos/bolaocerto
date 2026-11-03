import { IsDateString, IsEmail, IsOptional, IsString, Length, Matches, MinLength } from 'class-validator';
import { NEW_PASSWORD_MIN_LENGTH, NEW_PASSWORD_MAX_LENGTH, NEW_PASSWORD_MESSAGE, NEW_PASSWORD_PATTERN } from './password-policy';

export class RegisterDto {
  @IsString()
  @Length(2, 150)
  nome!: string;

  @IsString()
  @Length(11, 11)
  cpf!: string;

  @IsEmail()
  email!: string;

  @IsOptional()
  @IsString()
  telefone?: string;

  @IsDateString()
  dataNascimento!: string;

  @IsString()
  @Length(NEW_PASSWORD_MIN_LENGTH, NEW_PASSWORD_MAX_LENGTH, { message: NEW_PASSWORD_MESSAGE })
  @Matches(NEW_PASSWORD_PATTERN, { message: NEW_PASSWORD_MESSAGE })
  senha!: string;

  @IsOptional()
  @IsString()
  @Length(3, 20)
  codigoAfiliado?: string;

  /** Chave Pix para receber comissões (convite de afiliado). */
  @IsOptional()
  @IsString()
  @Length(5, 140)
  chavePixRepasse?: string;

  /** Hash do contrato de afiliação exibido no cadastro (convite de afiliado). */
  @IsOptional()
  @IsString()
  @Length(64, 64)
  aceiteContratoHash?: string;
}

export class LoginDto {
  @IsEmail()
  email!: string;

  @IsString()
  @MinLength(1)
  senha!: string;

  /** Código de 6 dígitos do aplicativo (ou código de recuperação). Só é exigido quando a conta tem 2FA. */
  @IsOptional()
  @IsString()
  @Length(6, 20)
  codigo?: string;
}

export class TwoFactorCodeDto {
  @IsString()
  @Length(6, 20)
  codigo!: string;
}

export class DisableTwoFactorDto extends TwoFactorCodeDto {
  @IsString()
  @MinLength(1)
  senha!: string;
}
