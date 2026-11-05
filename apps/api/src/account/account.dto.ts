import { IsBoolean, IsEmail, IsIn, IsNumber, IsOptional, IsString, Length, Matches, Max, MaxLength, Min, MinLength, ValidateIf } from 'class-validator';
import { NEW_PASSWORD_MIN_LENGTH, NEW_PASSWORD_MAX_LENGTH, NEW_PASSWORD_MESSAGE, NEW_PASSWORD_PATTERN } from '../auth/password-policy';

export class ForgotPasswordDto {
  @IsEmail() @MaxLength(180) email!: string;
}

export class ResetPasswordDto {
  @IsString() @Length(20, 200) token!: string;
  @IsString() @Length(NEW_PASSWORD_MIN_LENGTH, NEW_PASSWORD_MAX_LENGTH, { message: NEW_PASSWORD_MESSAGE }) @Matches(NEW_PASSWORD_PATTERN, { message: NEW_PASSWORD_MESSAGE }) novaSenha!: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(128) senhaAtual!: string;
  @IsString() @Length(NEW_PASSWORD_MIN_LENGTH, NEW_PASSWORD_MAX_LENGTH, { message: NEW_PASSWORD_MESSAGE }) @Matches(NEW_PASSWORD_PATTERN, { message: NEW_PASSWORD_MESSAGE }) novaSenha!: string;
}

export class DeletionRequestDto {
  @IsOptional() @IsString() @MaxLength(500) motivo?: string;
}

export class PauseDto {
  @IsOptional() @IsIn([30, 60, 90])
  dias?: number;

  @IsOptional() @IsBoolean()
  permanente?: boolean;
}

export class MonthlyLimitDto {
  /** null = sem limite (a remoção só vale depois de 24 h). */
  @ValidateIf((_o, value) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 }) @Min(10) @Max(1_000_000)
  valor!: number | null;
}

/** Dados que a própria pessoa pode mudar na conta. CPF e e-mail (que é o login) não mudam por aqui. */
export class UpdateProfileDto {
  @IsOptional() @IsString() @Length(2, 150) nome?: string;
  @IsOptional() @IsString() @Matches(/^\(?\d{2}\)?\s?9?\d{4}[-\s]?\d{4}$/, { message: 'Informe o telefone com DDD, por exemplo (11) 91234-5678.' }) telefone?: string;
  /** Chave Pix para receber (comissões, no caso do afiliado). Vazio apaga. */
  @IsOptional() @IsString() @MaxLength(140) chavePix?: string;
}
