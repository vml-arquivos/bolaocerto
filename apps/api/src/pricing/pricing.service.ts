import { BadRequestException, Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import { GameSelection, officialPriceRows, plannedKey, selectionKey, splitPool } from './pricing.engine';

@Injectable()
export class PricingService implements OnModuleInit {
  private readonly logger = new Logger(PricingService.name);
  constructor(private readonly prisma: PrismaService) {}
  /** Ao iniciar, garante que a tabela de preços da CAIXA esteja carregada (não mexe em preço que já existe). */
  async onModuleInit(): Promise<void> {
    try {
      const added = await this.ensureOfficialPrices();
      if (added > 0) this.logger.log(`Tabela de preços da CAIXA carregada: ${added} preços novos.`);
    } catch (error) {
      this.logger.warn(`Não foi possível carregar a tabela de preços agora: ${error instanceof Error ? error.message : error}`);
    }
  }
  /** Cadastra os preços oficiais que ainda não existem (por modalidade e tipo de aposta). Nunca sobrescreve um preço já cadastrado. */
  async ensureOfficialPrices(): Promise<number> {
    const existing = await this.prisma.precoLoteria.findMany({ select: { modalidade: true, chave: true } });
    const have = new Set(existing.map((row) => `${row.modalidade}:${row.chave}`));
    const missing = officialPriceRows().filter((row) => !have.has(`${row.modalidade}:${row.chave}`));
    if (!missing.length) return 0;
    // Data de verificação da tabela, não reconstrução de reajustes antigos.
    const date = new Date('2026-10-29T00:00:00Z');
    const result = await this.prisma.precoLoteria.createMany({ data: missing.map((row) => ({ ...row, vigenteDesde: date, verificadoEm: date })), skipDuplicates: true });
    return result.count;
  }
  private async currentPrices(tx: Prisma.TransactionClient, modalidade: string, keys: string[]) {
    const load = () => { const now = new Date(); return tx.precoLoteria.findMany({ where: { modalidade, chave: { in: [...new Set(keys)] }, vigenteDesde: { lte: now }, OR: [{ vigenteAte: null }, { vigenteAte: { gt: now } }] } }); };
    let prices = await load();
    if (keys.some((key) => !prices.some((price) => price.chave === key))) {
      // Preço faltando: carrega a tabela oficial e tenta de novo (uma vez).
      try { if (await this.ensureOfficialPrices() > 0) prices = await load(); } catch (error) { this.logger.warn(`Falha ao carregar preços: ${error instanceof Error ? error.message : error}`); }
    }
    return prices;
  }
  async catalog() {
    const query = () => { const now = new Date(); return this.prisma.precoLoteria.findMany({ where: { vigenteDesde: { lte: now }, OR: [{ vigenteAte: null }, { vigenteAte: { gt: now } }] }, orderBy: [{ modalidade: 'asc' }, { chave: 'asc' }] }); };
    const rows = await query();
    if (rows.length) return rows;
    try { if (await this.ensureOfficialPrices() > 0) return await query(); } catch (error) { this.logger.warn(`Falha ao carregar preços: ${error instanceof Error ? error.message : error}`); }
    return rows;
  }
  /** Quanto custa registrar cada jogo na CAIXA (tabela vigente). Não depende de bolão nem de cotas. */
  async priceGames(modalidade: string, games: GameSelection[], tx: Prisma.TransactionClient = this.prisma) {
    try {
      if (!games.length || games.length > 100) throw new Error('Informe de 1 a 100 jogos.');
      const keys = games.map((game) => selectionKey(modalidade, game));
      const prices = await this.currentPrices(tx, modalidade, keys);
      const rows = games.map((game, index) => {
        const matches = prices.filter((price) => price.chave === keys[index]);
        if (matches.length !== 1) throw new Error(`Preço vigente ausente ou ambíguo: ${modalidade}/${keys[index]}.`);
        return { ordem: index + 1, numeros: game.numeros, quantidadeDezenas: game.numeros.length, custoCentavos: matches[0]!.valorCentavos, chave: keys[index]! };
      });
      return { jogos: rows, custoTotalCentavos: rows.reduce((sum, row) => sum + row.custoCentavos, 0) };
    } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Cotação inválida.'); }
  }
  /**
   * Custo do registro de jogos que ainda não têm números: basta a quantidade de números de cada jogo e quantos jogos serão.
   * Ex.: Mega-Sena, 1 jogo de 9 números = R$ 504,00 (tabela vigente da CAIXA).
   */
  async priceByDezenas(modalidade: string, dezenas: number, jogos: number, tx: Prisma.TransactionClient = this.prisma) {
    try {
      if (!Number.isInteger(jogos) || jogos < 1 || jogos > 100) throw new Error('Informe de 1 a 100 jogos.');
      const key = plannedKey(modalidade, dezenas);
      const prices = await this.currentPrices(tx, modalidade, [key]);
      const matches = prices.filter((price) => price.chave === key);
      if (matches.length !== 1) throw new Error(`Preço vigente ausente ou ambíguo: ${modalidade}/${key}.`);
      const unitCents = matches[0]!.valorCentavos;
      return { modalidade, dezenas, jogos, custoPorJogoCentavos: unitCents, custoTotalCentavos: unitCents * jogos, fonte: matches[0]!.fonte };
    } catch (error) { throw new BadRequestException(error instanceof Error ? error.message : 'Cotação inválida.'); }
  }
  async quote(modalidade: string, games: GameSelection[], shares: number, feePct: number, tx: Prisma.TransactionClient = this.prisma) {
    try {
      if (!games.length || games.length > 100) throw new Error('Informe de 1 a 100 jogos.');
      if (!Number.isFinite(feePct) || Math.abs(feePct * 100 - Math.round(feePct * 100)) > 1e-6) throw new Error('Taxa deve ter no máximo duas casas decimais.');
      const keys = games.map(g => selectionKey(modalidade, g));
      const prices = await this.currentPrices(tx, modalidade, keys);
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
