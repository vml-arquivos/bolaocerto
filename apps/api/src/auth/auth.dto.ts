import { IsDateString, IsEmail, IsOptional, IsString, Length, MinLength } from 'class-validator';

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
  @MinLength(12)
  senha!: string;

  @IsOptional()
  @IsString()
  @Length(3, 20)
  codigoAfiliado?: string;
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
