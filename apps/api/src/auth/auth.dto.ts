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
}
