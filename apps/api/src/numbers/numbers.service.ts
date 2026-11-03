import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { PoolsService } from '../pools/pools.service';
import { AddBankDto, GenerateBankDto, ListBankQueryDto, MarkUsedDto } from './numbers.dto';
import { BANK_MODALITIES, BANK_RULES, gameKey, parseGames } from './numbers.rules';

type NewRow = { modalidade: string; numeros: number[]; origem: 'ia' | 'manual' | 'bolao'; estrategia?: string; rotulo?: string };

@Injectable()
export class NumbersService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly pools: PoolsService) {}

  async list(query: ListBankQueryDto) {
    const page = query.page ?? 1;
    const pageSize = query.pageSize ?? 50;
    const where: Prisma.BancoNumerosWhereInput = {
      ...(query.modalidade ? { modalidade: query.modalidade } : {}),
      ...(query.origem ? { origem: query.origem } : {}),
      ...(query.dezenas ? { quantidadeDezenas: query.dezenas } : {}),
      ...(query.semUso === 'true' ? { usos: 0 } : {}),
      ...(query.busca?.trim() ? { OR: [{ rotulo: { contains: query.busca.trim(), mode: 'insensitive' } }, ...(/^\d+$/.test(query.busca.trim()) ? [{ numeros: { has: Number(query.busca.trim()) } }] : [])] } : {}),
    };
    const [items, total, grouped] = await Promise.all([
      this.prisma.bancoNumeros.findMany({ where, orderBy: { criadoEm: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.bancoNumeros.count({ where }),
      this.prisma.bancoNumeros.groupBy({ by: ['modalidade'], _count: { _all: true } }),
    ]);
    return {
      items,
      pagination: { page, pageSize, total, pages: Math.max(Math.ceil(total / pageSize), 1) },
      resumo: { total: grouped.reduce((sum, row) => sum + row._count._all, 0), porModalidade: Object.fromEntries(grouped.map((row) => [row.modalidade, row._count._all])) },
    };
  }

  /** Grava só o que ainda não existe no banco (a chave única impede repetir o mesmo jogo). */
  private async insertMany(rows: NewRow[], actorId: string) {
    if (!rows.length) return { salvos: [] as string[], repetidos: 0 };
    const data = rows.map((row) => ({ modalidade: row.modalidade, numeros: [...row.numeros].sort((a, b) => a - b), quantidadeDezenas: row.numeros.length, chave: gameKey(row.modalidade, row.numeros), origem: row.origem, estrategia: row.estrategia ?? null, rotulo: row.rotulo?.trim() || null, criadoPor: actorId }));
    const created = await this.prisma.bancoNumeros.createMany({ data, skipDuplicates: true });
    return { salvos: data.map((item) => item.chave), repetidos: data.length - created.count };
  }

  /** Gera jogos (mesmo gerador do bolão, com custo da tabela CAIXA) e, por padrão, já guarda no banco. */
  async generate(dto: GenerateBankDto, actorId: string) {
    const rule = BANK_RULES[dto.modalidade]!;
    if (dto.dezenas < rule.min || dto.dezenas > rule.limit) throw new BadRequestException(`Use de ${rule.min} a ${rule.limit} números por jogo.`);
    const out = await this.pools.generateGames({ modalidade: dto.modalidade, quantidade: dto.quantidade, dezenas: dto.dezenas, estrategia: dto.estrategia, fixos: dto.fixos, excluir: dto.excluir });
    let repetidos = 0;
    let guardados = 0;
    if (dto.salvar !== false) {
      const result = await this.insertMany(out.jogos.map((game) => ({ modalidade: dto.modalidade, numeros: game.numeros, origem: 'ia' as const, estrategia: out.estrategia, rotulo: dto.rotulo })), actorId);
      repetidos = result.repetidos; guardados = result.salvos.length - result.repetidos;
      await this.audit.record(this.prisma, { entidade: 'configuracao', entidadeId: actorId, evento: 'numeros.gerados', atorId: actorId, payloadDepois: { modalidade: dto.modalidade, quantidade: dto.quantidade, dezenas: dto.dezenas, guardados, repetidos } });
    }
    return { ...out, guardados, repetidos, salvo: dto.salvar !== false };
  }

  /** Jogos digitados à mão (um por linha). */
  async add(dto: AddBankDto, actorId: string) {
    const { jogos, erros } = parseGames(dto.modalidade, dto.jogos);
    if (erros.length) throw new BadRequestException(erros.slice(0, 5).join(' '));
    if (!jogos.length) throw new BadRequestException('Digite ao menos um jogo.');
    if (jogos.length > 100) throw new BadRequestException('Guarde até 100 jogos por vez.');
    const result = await this.insertMany(jogos.map((numeros) => ({ modalidade: dto.modalidade, numeros, origem: 'manual' as const, rotulo: dto.rotulo })), actorId);
    const guardados = result.salvos.length - result.repetidos;
    await this.audit.record(this.prisma, { entidade: 'configuracao', entidadeId: actorId, evento: 'numeros.digitados', atorId: actorId, payloadDepois: { modalidade: dto.modalidade, guardados, repetidos: result.repetidos } });
    return { guardados, repetidos: result.repetidos };
  }

  async remove(id: string, actorId: string) {
    const row = await this.prisma.bancoNumeros.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Jogo não encontrado no banco.');
    await this.prisma.bancoNumeros.delete({ where: { id } });
    await this.audit.record(this.prisma, { entidade: 'configuracao', entidadeId: actorId, evento: 'numeros.removido', atorId: actorId, payloadAntes: { modalidade: row.modalidade, numeros: row.numeros } });
    return { removido: true };
  }

  /** Chamado quando os jogos entram num bolão: soma um uso nos que já estão no banco e guarda os novos. */
  async markUsed(dto: MarkUsedDto, actorId: string) {
    const rule = BANK_RULES[dto.modalidade]!;
    const valid = dto.jogos.map((game) => game.numeros).filter((nums) => nums.length >= rule.min && nums.length <= rule.limit && new Set(nums).size === nums.length && nums.every((n) => Number.isInteger(n) && n >= 1 && n <= rule.max));
    if (!valid.length) return { atualizados: 0, novos: 0 };
    const keys = [...new Set(valid.map((nums) => gameKey(dto.modalidade, nums)))];
    const existing = await this.prisma.bancoNumeros.findMany({ where: { chave: { in: keys } }, select: { chave: true } });
    const known = new Set(existing.map((row) => row.chave));
    const fresh = valid.filter((nums, index) => !known.has(gameKey(dto.modalidade, nums)) && valid.findIndex((other) => gameKey(dto.modalidade, other) === gameKey(dto.modalidade, nums)) === index);
    await this.insertMany(fresh.map((numeros) => ({ modalidade: dto.modalidade, numeros, origem: 'bolao' as const })), actorId);
    await this.prisma.bancoNumeros.updateMany({ where: { chave: { in: keys } }, data: { usos: { increment: 1 }, ultimoUsoEm: new Date() } });
    return { atualizados: keys.length - fresh.length, novos: fresh.length };
  }

  modalities() { return BANK_MODALITIES.map((key) => ({ modalidade: key, ...BANK_RULES[key] })); }
}
