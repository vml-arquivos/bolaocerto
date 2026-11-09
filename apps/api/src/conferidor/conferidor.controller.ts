import { Body, Controller, Get, Post } from '@nestjs/common';
import { ArrayMaxSize, ArrayMinSize, IsArray, IsIn, IsInt, IsOptional, IsString, Max, Min } from 'class-validator';
import { ConferidorService } from './conferidor.service';

export class ConferirDto {
  @IsString() @IsIn(['megasena', 'lotofacil', 'quina', 'lotomania', 'duplasena', 'timemania', 'diadesorte']) modalidade!: string;
  /** Opcional: número do concurso. Sem ele, usa o último com resultado. */
  @IsOptional() @IsInt() @Min(1) @Max(99999) concurso?: number;
  /** Cada jogo é uma lista de números; a conferência valida número a número e explica o erro de cada jogo. */
  @IsArray() @ArrayMinSize(1) @ArrayMaxSize(20) @IsArray({ each: true }) @ArrayMaxSize(100, { each: true }) jogos!: number[][];
}

/** Conferidor público: a pessoa digita os próprios jogos e vê os acertos no resultado oficial. Não grava nada. */
@Controller('conferidor')
export class ConferidorController {
  constructor(private readonly service: ConferidorService) {}

  @Get('modalidades') modalities() { return this.service.modalities(); }

  @Post() check(@Body() dto: ConferirDto) { return this.service.check(dto); }
}
