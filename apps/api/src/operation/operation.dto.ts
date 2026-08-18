import { IsUrl } from 'class-validator';

export class RegisterPoolDto {
  @IsUrl({ protocols: ['https'], require_protocol: true })
  comprovanteUrl!: string;
}
