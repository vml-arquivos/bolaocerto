import { Equals, IsBoolean, IsDateString, IsEmail, IsOptional, IsString, Length, Matches, MinLength } from 'class-validator';
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

  /** Celular com DDD (10 ou 11 números). Obrigatório: entra no contrato e nos avisos. */
  @IsString()
  @Matches(/^\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}$/, { message: 'Informe o telefone com DDD, por exemplo (11) 91234-5678.' })
  telefone!: string;

  /** Opcional: o cadastro simples não pede a data de nascimento. Quando vem, precisa ser de maior de 18 anos. */
  @IsOptional()
  @IsDateString()
  dataNascimento?: string;

  /** Declaração de maioridade. Obrigatória quando a data de nascimento não é informada. */
  @IsOptional()
  @IsBoolean()
  maiorDeIdade?: boolean;

  @IsString()
  @Length(NEW_PASSWORD_MIN_LENGTH, NEW_PASSWORD_MAX_LENGTH, { message: NEW_PASSWORD_MESSAGE })
  @Matches(NEW_PASSWORD_PATTERN, { message: NEW_PASSWORD_MESSAGE })
  senha!: string;

  /** Repetir a senha evita erro de digitação no cadastro. */
  @IsString()
  @Length(1, NEW_PASSWORD_MAX_LENGTH, { message: 'Repita a senha.' })
  confirmarSenha!: string;

  /** Aceite dos Termos de Uso. */
  @Equals(true, { message: 'Aceite os Termos de Uso para criar a conta.' })
  aceiteTermos!: boolean;

  /** Ciência da Política de Privacidade (LGPD). */
  @Equals(true, { message: 'Aceite a Política de Privacidade (LGPD) para criar a conta.' })
  aceitePrivacidade!: boolean;

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
