import { IsEnum } from 'class-validator';

export class CreatePaymentDto {
  @IsEnum(['pix', 'cartao', 'boleto'])
  metodo!: 'pix' | 'cartao' | 'boleto';
}
