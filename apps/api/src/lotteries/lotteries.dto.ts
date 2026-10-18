import { Type } from 'class-transformer';
import { IsBoolean, IsInt, IsOptional, IsString, Matches, Min } from 'class-validator';

export class CreateManualContestDto {
  @IsString()
  modalidade!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  numeroConcurso!: number;

  /** Data do sorteio no formato AAAA-MM-DD (horário de Brasília). */
  @Matches(/^\d{4}-\d{2}-\d{2}$/, { message: 'Use a data no formato AAAA-MM-DD.' })
  dataSorteio!: string;

  @IsOptional()
  @IsBoolean()
  acumulado?: boolean;
}
