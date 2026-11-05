import { Type } from 'class-transformer';
import { ArrayMinSize, IsArray, IsBoolean, IsDateString, IsEnum, IsIn, IsInt, IsNumber, IsOptional, IsObject, ArrayMaxSize, IsPositive, IsString, IsUUID, Matches, Max, MaxLength, Min, ValidateIf, ValidateNested } from 'class-validator';

export class PoolGameDto {
  @IsInt()
  @Min(1)
  ordem!: number;

  @IsArray()
  @ArrayMinSize(1)
  @IsInt({ each: true })
  numeros!: number[];

  @IsOptional()
  @IsInt()
  @Min(1)
  quantidadeDezenas?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  custo?: number;

  @IsOptional()
  @IsObject()
  selecao?: { trevos?: number[]; colunas?: number[][]; mesSorte?: number; timeCoracao?: string };

}

export class CreatePoolDto {
  @IsOptional()
  @IsInt()
  @Min(1)
  totalCotadoCentavos?: number;

  @IsOptional()
  @IsBoolean()
  precificacaoAutomatica?: boolean;

  @IsUUID()
  concursoId!: string;

  @IsUUID()
  grupoId!: string;

  @IsArray()
  @IsInt({ each: true })
  numerosApostados!: number[];

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PoolGameDto)
  jogos?: PoolGameDto[];

  @IsOptional()
  @IsBoolean()
  cotasIlimitadas?: boolean;

  @ValidateIf((dto: CreatePoolDto) => !dto.cotasIlimitadas)
  @IsInt()
  @Min(1)
  totalCotas?: number;

  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valorCota!: number;

  /** Percentual da taxa. No modelo antigo vai até 35 (sobre o custo); no preço livre é a taxa dentro da cota (até 100). */
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(100)
  taxaAdministracaoPct!: number;

  /** Preço livre (só administrador): o valor da cota é o informado; o custo do registro na CAIXA é apenas referência e a sobra é a taxa de serviço. */
  @IsOptional()
  @IsBoolean()
  precoLivre?: boolean;

  /** Preço livre com taxa definida pelo administrador: taxa de serviço por cota, em centavos. Sem ela, a taxa é o que sobra da cota depois do registro. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  taxaPorCotaCentavos?: number;

  /** Preço livre sem a tabela da CAIXA: custo total do registro, em centavos. */
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(1_000_000_000)
  custoRegistroCentavos?: number;

  @IsEnum(['mandato', 'loterica_parceira'])
  modeloOperacional!: 'mandato' | 'loterica_parceira';

  /** Bolão condicional: cotas só são liberadas quando o prêmio estimado atingir este valor (R$). */
  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100_000_000_000)
  premioMinimoLiberacao?: number;

  /** Pré-venda: vende as cotas antes de apostar (sem comprovante prévio). Só o administrador pode ligar. */
  @IsOptional()
  @IsBoolean()
  vendaAntecipada?: boolean;

  @IsOptional()
  @ValidateIf((_dto: object, value: unknown) => value !== null)
  @IsDateString()
  vendaInicioEm?: string | null;

  @IsOptional()
  @ValidateIf((_dto: object, value: unknown) => value !== null)
  @IsDateString()
  vendaFimEm?: string | null;

  /** Máximo de cotas que uma mesma pessoa pode comprar neste bolão. */
  @IsOptional()
  @ValidateIf((_dto: object, value: unknown) => value !== null)
  @IsInt()
  @Min(1)
  @Max(1000)
  maxCotasPorPessoa?: number | null;

  /** Texto livre mostrado ao cliente antes de comprar. */
  @IsOptional()
  @ValidateIf((_dto: object, value: unknown) => value !== null)
  @IsString()
  @MaxLength(1200)
  regrasVenda?: string | null;

  @IsOptional()
  @IsUUID()
  lotericaParceiraId?: string;
}

export class UpdatePoolDto {
  @IsOptional()
  @IsArray()
  @IsInt({ each: true })
  numerosApostados?: number[];

  @IsOptional()
  @IsString()
  descricao?: string;

  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => PoolGameDto)
  jogos?: PoolGameDto[];

  @IsOptional()
  @IsBoolean()
  cotasIlimitadas?: boolean;

  @IsOptional()
  @IsInt()
  @Min(1)
  totalCotas?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  valorCota?: number;

  @IsOptional()
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  @Max(35)
  taxaAdministracaoPct?: number;

  /** Use null para remover a condição de liberação. */
  @IsOptional()
  @ValidateIf((_dto: UpdatePoolDto, value: unknown) => value !== null)
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsPositive()
  @Max(100_000_000_000)
  premioMinimoLiberacao?: number | null;

  /** Pré-venda: vende as cotas antes de apostar (sem comprovante prévio). Só o administrador pode ligar. */
  @IsOptional()
  @IsBoolean()
  vendaAntecipada?: boolean;

  @IsOptional()
  @ValidateIf((_dto: object, value: unknown) => value !== null)
  @IsDateString()
  vendaInicioEm?: string | null;

  @IsOptional()
  @ValidateIf((_dto: object, value: unknown) => value !== null)
  @IsDateString()
  vendaFimEm?: string | null;

  /** Máximo de cotas que uma mesma pessoa pode comprar neste bolão. */
  @IsOptional()
  @ValidateIf((_dto: object, value: unknown) => value !== null)
  @IsInt()
  @Min(1)
  @Max(1000)
  maxCotasPorPessoa?: number | null;

  /** Texto livre mostrado ao cliente antes de comprar. */
  @IsOptional()
  @ValidateIf((_dto: object, value: unknown) => value !== null)
  @IsString()
  @MaxLength(1200)
  regrasVenda?: string | null;
}

/** Pedido do gerador de jogos do bolão: quantos jogos, quantos números em cada um, e como escolher. */
export class GenerateGamesDto {
  @IsIn(['megasena', 'lotofacil', 'quina', 'duplasena', 'lotomania'])
  modalidade!: string;

  @IsInt() @Min(1) @Max(100)
  quantidade!: number;

  @IsInt() @Min(1) @Max(100)
  dezenas!: number;

  @IsOptional() @IsIn(['equilibrado', 'quentes', 'atrasados', 'misto', 'aleatorio'])
  estrategia?: 'equilibrado' | 'quentes' | 'atrasados' | 'misto' | 'aleatorio';

  /** Números que devem entrar em todos os jogos, separados por vírgula. */
  @IsOptional() @IsString() @MaxLength(80) @Matches(/^[0-9, ]*$/)
  fixos?: string;

  /** Números a evitar, separados por vírgula. */
  @IsOptional() @IsString() @MaxLength(200) @Matches(/^[0-9, ]*$/)
  excluir?: string;
}
