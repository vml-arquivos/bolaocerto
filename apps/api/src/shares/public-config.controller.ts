import { Controller, Get, ServiceUnavailableException } from '@nestjs/common';

@Controller('config')
export class PublicConfigController {
  @Get('mandato')
  mandate() {
    const hash = process.env.MANDATO_TERM_HASH;
    if (!hash) throw new ServiceUnavailableException('Termo de participação ainda não configurado.');
    return {
      hash,
      versao: process.env.MANDATO_TERM_VERSION ?? '2026-09-01',
      pagamentosHabilitados: process.env.PAYMENTS_ENABLED === 'true',
      resumo: 'Autorizo a aquisição e o registro da participação descrita, declaro ter mais de 18 anos e aceito as regras exibidas pelo BL — Bolão Livre.',
    };
  }
}
