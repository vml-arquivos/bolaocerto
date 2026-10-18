import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsOptional, IsString, IsUUID, MaxLength, Min } from 'class-validator';

export class CreatePaymentDto {
  @IsIn(['pix', 'boleto', 'cartao', 'pix_automatico'], { message: 'Método de pagamento inválido.' })
  metodo!: 'pix' | 'boleto' | 'cartao' | 'pix_automatico';
}

export const MANUAL_PAYMENT_FORMS = ['dinheiro', 'pix_direto', 'transferencia', 'cartao_maquininha', 'outro'] as const;

export class ManualPaymentDto {
  @IsIn(MANUAL_PAYMENT_FORMS as unknown as string[])
  forma!: (typeof MANUAL_PAYMENT_FORMS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observacao?: string;
}

export class ManualSaleDto {
  @IsUUID()
  bolaoId!: string;

  @IsUUID()
  usuarioId!: string;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  quantidade!: number;

  @IsBoolean()
  pago!: boolean;

  @IsOptional()
  @IsIn(MANUAL_PAYMENT_FORMS as unknown as string[])
  forma?: (typeof MANUAL_PAYMENT_FORMS)[number];

  @IsOptional()
  @IsString()
  @MaxLength(20)
  codigoAfiliado?: string;

  @IsOptional()
  @IsString()
  @MaxLength(300)
  observacao?: string;

  /** O operador atesta que o participante aceitou o termo de participação. */
  @IsBoolean()
  aceiteTermoConfirmado!: boolean;
}

export class CancelShareDto {
  @IsOptional()
  @IsString()
  @MaxLength(300)
  motivo?: string;
}
