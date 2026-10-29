import { Controller, Get, Param, NotFoundException } from '@nestjs/common';
import { legalDocument, LegalKind } from '../legal/documents';
@Controller('config')
export class PublicConfigController {
  @Get('mandato')
  mandate() {
    const doc = legalDocument('participacao');
    return { ...doc, pagamentosHabilitados: doc.aprovado && process.env.PAYMENTS_ENABLED === 'true' };
  }
  @Get('contratos/:tipo')
  document(@Param('tipo') kind: string) {
    if (!['participacao', 'privacidade', 'afiliado'].includes(kind)) throw new NotFoundException('Documento não encontrado.');
    return legalDocument(kind as LegalKind);
  }
}
