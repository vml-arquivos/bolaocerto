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
