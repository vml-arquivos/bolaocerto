import { BadRequestException, Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { GameSelection, selectionKey, splitPool } from './pricing.engine';

@Injectable()
export class PricingService {
  constructor(private readonly prisma: PrismaService) {}
  async catalog() {
    const now = new Date();
    return this.prisma.precoLoteria.findMany({ where: { vigenteDesde: { lte: now }, OR: [{ vigenteAte: null }, { vigenteAte: { gt: now } }] }, orderBy: [{ modalidade: 'asc' }, { chave: 'asc' }] });
  }
  async quote(modalidade: string, games: GameSelection[], shares: number, feePct: number, tx: Prisma.TransactionClient = this.prisma) {
    try {
      if (!games.length || games.length > 100) throw new Error('Informe de 1 a 100 jogos.');
      if (!Number.isFinite(feePct) || Math.abs(feePct * 100 - Math.round(feePct * 100)) > 1e-6) throw new Error('Taxa deve ter no máximo duas casas decimais.');
      const keys = games.map(g => selectionKey(modalidade, g));
      const now = new Date();
      const prices = await tx.precoLoteria.findMany({ where: { modalidade, chave: { in: keys }, vigenteDesde: { lte: now }, OR: [{ vigenteAte: null }, { vigenteAte: { gt: now } }] } });
      const priced = games.map((game, i) => {
        const matches = prices.filter(p => p.chave === keys[i]);
        if (matches.length !== 1) throw new Error(`Preço vigente ausente ou ambíguo: ${modalidade}/${keys[i]}.`);
        const price = matches[0]!;
        return { ...game, ordem: i + 1, quantidadeDezenas: game.colunas ? game.colunas.reduce((s, c) => s + c.length, 0) : game.numeros.length, custo: price.valorCentavos / 100, precoId: price.id, chave: price.chave, fonte: price.fonte };
      });
      return { modalidade, jogos: priced, ...splitPool(priced.reduce((s, g) => s + Math.round(g.custo * 100), 0), shares, Math.round(feePct * 100)) };
    } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Cotação inválida.'); }
  }
}
