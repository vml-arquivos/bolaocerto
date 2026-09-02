import { IsEnum } from 'class-validator';

export class CreatePaymentDto {
  @IsEnum(['pix'])
  metodo!: 'pix';
}
