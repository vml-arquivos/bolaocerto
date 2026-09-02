import { IsInt, IsOptional, IsString, IsUUID, Length, Min, MaxLength } from 'class-validator';

export class ReserveShareDto {
  @IsUUID()
  bolaoId!: string;

  @IsInt()
  @Min(1)
  quantidade!: number;

  @IsString()
  @Length(11, 11)
  titularCpf!: string;

  @IsString()
  @Length(2, 150)
  titularNome!: string;

  @IsString()
  @Length(64, 64)
  termoMandatoHash!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigoAfiliado?: string;
}
