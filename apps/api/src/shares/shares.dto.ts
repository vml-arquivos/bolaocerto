import { Equals, IsInt, IsOptional, IsString, IsUUID, Length, Min, MaxLength } from 'class-validator';

export class ReserveShareDto {
  @Equals(true)
  aceitoTermos!: boolean;

  @IsUUID()
  bolaoId!: string;

  @IsInt()
  @Min(1)
  quantidade!: number;

  /** Sem titular informado, a cota fica no nome e CPF do cadastro de quem compra. */
  @IsOptional()
  @IsString()
  @Length(11, 11)
  titularCpf?: string;

  @IsOptional()
  @IsString()
  @Length(2, 150)
  titularNome?: string;

  @IsString()
  @Length(64, 64)
  termoMandatoHash!: string;

  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigoAfiliado?: string;
}
