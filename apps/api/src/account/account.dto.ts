import { IsEmail, IsOptional, IsString, Length, MaxLength, MinLength } from 'class-validator';

export class ForgotPasswordDto {
  @IsEmail() @MaxLength(180) email!: string;
}

export class ResetPasswordDto {
  @IsString() @Length(20, 200) token!: string;
  @IsString() @MinLength(12, { message: 'A nova senha deve ter pelo menos 12 caracteres.' }) @MaxLength(128) novaSenha!: string;
}

export class ChangePasswordDto {
  @IsString() @MinLength(1) @MaxLength(128) senhaAtual!: string;
  @IsString() @MinLength(12, { message: 'A nova senha deve ter pelo menos 12 caracteres.' }) @MaxLength(128) novaSenha!: string;
}

export class DeletionRequestDto {
  @IsOptional() @IsString() @MaxLength(500) motivo?: string;
}
