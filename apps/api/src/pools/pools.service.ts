import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatusBolao, StatusCota } from '@prisma/client';
import { AuthUser } from '../auth/auth.utils';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { CreatePoolDto, PoolGameDto, UpdatePoolDto } from './pools.dto';

@Injectable()
export class PoolsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listPublic() {
    const pools = await this.prisma.bolao.findMany({
      where: { status: { in: [StatusBolao.aberto, StatusBolao.fechado, StatusBolao.registrado, StatusBolao.apurado] } },
      include: { concurso: true, grupo: true, jogos: { orderBy: { ordem: 'asc' } } },
      orderBy: { criadoEm: 'desc' },
      take: 100,
    });
    return pools.map((pool) => this.toPublic(pool));
  }

  async getPublicById(id: string) {
    const pool = await this.prisma.bolao.findUnique({ where: { id }, include: { concurso: true, grupo: true, jogos: { orderBy: { ordem: 'asc' } } } });
    if (!pool) throw new NotFoundException('Bolão não encontrado.');
    return this.toPublic(pool);
  }

  async getGroupBySlug(slug: string) {
    const group = await this.prisma.grupo.findUnique({ where: { slug }, include: { boloes: { include: { concurso: true, grupo: true, jogos: { orderBy: { ordem: 'asc' } } }, orderBy: { criadoEm: 'desc' } } } });
    if (!group) throw new NotFoundException('Grupo não encontrado.');
    return { id: group.id, nome: group.nome, slug: group.slug, tipo: group.tipo, descricao: group.descricao, boloes: group.boloes.map((pool) => this.toPublic(pool)) };
  }

  async create(dto: CreatePoolDto, user: AuthUser) {
    if (!['admin', 'afiliado'].includes(user.papel)) throw new ForbiddenException('Somente administradores e afiliados aprovados podem criar bolões.');
    const affiliate = user.papel === 'afiliado' ? await this.prisma.afiliado.findUnique({ where: { usuarioId: user.id } }) : null;
    if (user.papel === 'afiliado' && (!affiliate || affiliate.statusAprovacao !== 'aprovado')) throw new ForbiddenException('O afiliado precisa estar aprovado para criar bolões.');
    const contest = await this.prisma.concurso.findUnique({ where: { id: dto.concursoId }, include: { config: true } });
    if (!contest) throw new NotFoundException('Concurso não encontrado.');
    if (contest.cutoffAt <= new Date()) throw new ConflictException('O concurso já passou do cutoff.');
    if (dto.taxaAdministracaoPct > Number(contest.config.taxaAdministracaoTetoPct)) throw new ConflictException('Taxa de administração acima do teto da modalidade.');
    if (dto.totalCotas < contest.config.minCotasBolao || dto.totalCotas > contest.config.maxCotasBolao) throw new ConflictException('Quantidade de cotas fora dos limites da modalidade.');
    if (dto.modeloOperacional === 'loterica_parceira' && !dto.lotericaParceiraId) throw new ConflictException('Bolão com lotérica parceira exige uma lotérica ativa.');
    if (dto.modeloOperacional === 'loterica_parceira') {
      const partner = await this.prisma.lotericaParceira.findFirst({ where: { id: dto.lotericaParceiraId, statusContrato: 'ativo' } });
      if (!partner) throw new NotFoundException('Lotérica parceira ativa não encontrada.');
    }
    const group = await this.prisma.grupo.findFirst({ where: { id: dto.grupoId, ...(affiliate ? { afiliadoId: affiliate.id } : {}) } });
    if (!group) throw new NotFoundException(affiliate ? 'Grupo não encontrado na sua área de afiliado.' : 'Grupo não encontrado.');

    const games = this.normalizeGames(dto.jogos, dto.numerosApostados);
    const pool = await this.prisma.$transaction(async (tx) => {
      const created = await tx.bolao.create({
        data: {
          concursoId: dto.concursoId,
          grupoId: dto.grupoId,
          criadoPor: user.id,
          tipoOrganizador: affiliate ? 'afiliado' : 'admin',
          numerosApostados: games[0]!.numeros,
          totalCotas: dto.totalCotas,
          valorCota: new Prisma.Decimal(dto.valorCota),
          taxaAdministracaoPct: new Prisma.Decimal(dto.taxaAdministracaoPct),
          modeloOperacional: dto.modeloOperacional,
          lotericaParceiraId: dto.lotericaParceiraId,
        },
      });
      await tx.jogoBolao.createMany({ data: games.map((game) => ({ bolaoId: created.id, ordem: game.ordem, numeros: game.numeros, quantidadeDezenas: game.quantidadeDezenas, custo: new Prisma.Decimal(game.custo ?? 0), status: 'ativo' })) });
      if (dto.descricao !== undefined) await tx.grupo.update({ where: { id: dto.grupoId }, data: { descricao: dto.descricao } });
      await this.audit.record(tx, { entidade: 'bolao', entidadeId: created.id, evento: 'bolao.criado', atorId: user.id, payloadDepois: { ...created, jogos: games } as unknown as Prisma.InputJsonValue });
      return created;
    });
    return this.getPublicById(pool.id);
  }

  async update(id: string, dto: UpdatePoolDto, user: AuthUser) {
    const pool = await this.prisma.bolao.findUnique({ where: { id }, include: { cotas: true, jogos: { orderBy: { ordem: 'asc' } } } });
    if (!pool) throw new NotFoundException('Bolão não encontrado.');
    await this.assertCanManagePool(pool, user);
    const editableStatuses: StatusBolao[] = [StatusBolao.rascunho, StatusBolao.aberto];
    if (!editableStatuses.includes(pool.status)) throw new ConflictException('Bolão não pode mais ser editado neste estado.');
    const hasPaid = pool.cotas.some((share) => ([StatusCota.paga, StatusCota.registrada, StatusCota.apurada, StatusCota.premiada] as StatusCota[]).includes(share.status));
    const sensitiveChanged = dto.numerosApostados !== undefined || dto.jogos !== undefined || dto.totalCotas !== undefined || dto.valorCota !== undefined || dto.taxaAdministracaoPct !== undefined;
    if (hasPaid && sensitiveChanged) throw new ConflictException('Campos sensíveis não podem ser alterados após confirmação de pagamento.');
    if (dto.totalCotas !== undefined && dto.totalCotas < pool.cotasVendidas) throw new ConflictException('Total de cotas não pode ficar abaixo das cotas já vendidas.');

    const games = dto.jogos !== undefined || dto.numerosApostados !== undefined ? this.normalizeGames(dto.jogos, dto.numerosApostados ?? pool.numerosApostados) : null;
    const before = pool as unknown as Prisma.InputJsonValue;
    await this.prisma.$transaction(async (tx) => {
      const updated = await tx.bolao.update({ where: { id }, data: {
        ...(dto.numerosApostados !== undefined || games ? { numerosApostados: games![0]!.numeros } : {}),
        ...(dto.totalCotas !== undefined ? { totalCotas: dto.totalCotas } : {}),
        ...(dto.valorCota !== undefined ? { valorCota: new Prisma.Decimal(dto.valorCota) } : {}),
        ...(dto.taxaAdministracaoPct !== undefined ? { taxaAdministracaoPct: new Prisma.Decimal(dto.taxaAdministracaoPct) } : {}),
        editadoPor: user.id,
        editadoEm: new Date(),
      } });
      if (games) {
        await tx.jogoBolao.deleteMany({ where: { bolaoId: id } });
        await tx.jogoBolao.createMany({ data: games.map((game) => ({ bolaoId: id, ordem: game.ordem, numeros: game.numeros, quantidadeDezenas: game.quantidadeDezenas, custo: new Prisma.Decimal(game.custo ?? 0), status: 'ativo' })) });
      }
      if (dto.descricao !== undefined) await tx.grupo.update({ where: { id: pool.grupoId }, data: { descricao: dto.descricao } });
      await this.audit.record(tx, { entidade: 'bolao', entidadeId: id, evento: 'bolao.editado', atorId: user.id, payloadAntes: before, payloadDepois: { ...updated, jogos: games ?? pool.jogos } as unknown as Prisma.InputJsonValue });
    });
    return this.getPublicById(id);
  }

  async publish(id: string, user: AuthUser) {
    const pool = await this.prisma.bolao.findUnique({ where: { id }, include: { concurso: true } });
    if (!pool) throw new NotFoundException('Bolão não encontrado.');
    await this.assertCanManagePool(pool, user);
    if (pool.status !== StatusBolao.rascunho) throw new ConflictException('Somente bolões em rascunho podem ser publicados.');
    if (pool.concurso.cutoffAt <= new Date()) throw new ConflictException('O concurso já passou do cutoff.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.bolao.update({ where: { id }, data: { status: StatusBolao.aberto, editadoPor: user.id, editadoEm: new Date() } });
      await this.audit.record(tx, { entidade: 'bolao', entidadeId: id, evento: 'bolao.publicado', atorId: user.id, payloadDepois: result as unknown as Prisma.InputJsonValue });
      return result;
    });
    return { id: updated.id, status: updated.status };
  }

  async close(id: string, user: AuthUser) {
    const pool = await this.prisma.bolao.findUnique({ where: { id } });
    if (!pool) throw new NotFoundException('Bolão não encontrado.');
    await this.assertCanManagePool(pool, user);
    if (pool.status !== StatusBolao.aberto) throw new ConflictException('Somente bolões abertos podem ser fechados.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.bolao.update({ where: { id }, data: { status: StatusBolao.fechado, editadoPor: user.id, editadoEm: new Date() } });
      await this.audit.record(tx, { entidade: 'bolao', entidadeId: id, evento: 'bolao.fechado', atorId: user.id, payloadDepois: result as unknown as Prisma.InputJsonValue });
      return result;
    });
    return { id: updated.id, status: updated.status };
  }

  async duplicate(id: string, user: AuthUser) {
    const pool = await this.prisma.bolao.findUnique({ where: { id }, include: { jogos: { orderBy: { ordem: 'asc' } } } });
    if (!pool) throw new NotFoundException('Bolão não encontrado.');
    await this.assertCanManagePool(pool, user);
    const created = await this.prisma.$transaction(async (tx) => {
      const copy = await tx.bolao.create({ data: { concursoId: pool.concursoId, grupoId: pool.grupoId, criadoPor: user.id, tipoOrganizador: pool.tipoOrganizador, numerosApostados: pool.numerosApostados, totalCotas: pool.totalCotas, valorCota: pool.valorCota, taxaAdministracaoPct: pool.taxaAdministracaoPct, modeloOperacional: pool.modeloOperacional, lotericaParceiraId: pool.lotericaParceiraId, status: StatusBolao.rascunho } });
      if (pool.jogos.length) await tx.jogoBolao.createMany({ data: pool.jogos.map((game) => ({ bolaoId: copy.id, ordem: game.ordem, numeros: game.numeros, quantidadeDezenas: game.quantidadeDezenas, custo: game.custo, status: 'ativo' })) });
      await this.audit.record(tx, { entidade: 'bolao', entidadeId: copy.id, evento: 'bolao.duplicado', atorId: user.id, payloadDepois: { origemId: id, copiaId: copy.id } });
      return copy;
    });
    return this.getPublicById(created.id);
  }

  async cancel(id: string, user: AuthUser) {
    const pool = await this.prisma.bolao.findUnique({ where: { id }, include: { cotas: true } });
    if (!pool) throw new NotFoundException('Bolão não encontrado.');
    await this.assertCanManagePool(pool, user);
    if (pool.status === StatusBolao.registrado || pool.status === StatusBolao.apurado) throw new ConflictException('Bolão registrado não pode ser cancelado por esta operação.');
    const paid = pool.cotas.some((share) => share.status === StatusCota.paga);
    if (paid) throw new ConflictException('Existem cotas pagas; execute o fluxo de estorno do provedor antes de cancelar.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.bolao.update({ where: { id }, data: { status: StatusBolao.cancelado } });
      await this.audit.record(tx, { entidade: 'bolao', entidadeId: id, evento: 'bolao.cancelado', atorId: user.id, payloadDepois: cancelled as unknown as Prisma.InputJsonValue });
      return cancelled;
    });
    return { id: updated.id, status: updated.status };
  }

  private async assertCanManagePool(pool: { criadoPor: string }, user: AuthUser): Promise<void> {
    if (user.papel === 'admin') return;
    if (user.papel !== 'afiliado' || pool.criadoPor !== user.id) throw new ForbiddenException('Você só pode operar seus próprios bolões.');
    const affiliate = await this.prisma.afiliado.findUnique({ where: { usuarioId: user.id }, select: { statusAprovacao: true } });
    if (!affiliate || affiliate.statusAprovacao !== 'aprovado') throw new ForbiddenException('O afiliado precisa estar aprovado para operar bolões.');
  }

  private normalizeGames(games: PoolGameDto[] | undefined, legacyNumbers: number[]): Array<{ ordem: number; numeros: number[]; quantidadeDezenas: number; custo?: number }> {
    const source = games?.length ? games : [{ ordem: 1, numeros: legacyNumbers, quantidadeDezenas: legacyNumbers.length, custo: 0 }];
    const normalized = source
      .map((game, index) => {
        const numeros = [...new Set(game.numeros.map(Number))].sort((a, b) => a - b);
        return { ordem: Number(game.ordem || index + 1), numeros, quantidadeDezenas: Number(game.quantidadeDezenas ?? numeros.length), custo: Number(game.custo ?? 0) };
      })
      .sort((a, b) => a.ordem - b.ordem);
    if (normalized.some((game, index) => game.ordem !== index + 1)) throw new ConflictException('A ordem dos jogos deve ser sequencial, começando em 1.');
    if (normalized.some((game) => game.numeros.length === 0 || game.quantidadeDezenas !== game.numeros.length)) throw new ConflictException('Cada jogo precisa ter números válidos e quantidade de dezenas consistente.');
    if (normalized.some((game) => game.custo < 0)) throw new ConflictException('O custo dos jogos não pode ser negativo.');
    return normalized;
  }

  private toPublic(pool: any) {
    const jogos = Array.isArray(pool.jogos) ? pool.jogos.map((game: any) => ({ id: game.id, ordem: game.ordem, numeros: game.numeros, quantidadeDezenas: game.quantidadeDezenas, custo: Number(game.custo ?? 0).toFixed(2), status: game.status })) : [];
    const custoJogos = jogos.reduce((sum: number, game: { custo: string }) => sum + Number(game.custo), 0);
    const receitaPrevista = Number(pool.valorCota) * pool.totalCotas;
    const taxaPrevista = receitaPrevista * Number(pool.taxaAdministracaoPct) / 100;
    return {
      id: pool.id,
      concursoId: pool.concursoId,
      grupoId: pool.grupoId,
      numerosApostados: pool.numerosApostados,
      jogos,
      quantidadeJogos: jogos.length || (pool.numerosApostados.length ? 1 : 0),
      totalCotas: pool.totalCotas,
      cotasVendidas: pool.cotasVendidas,
      cotasDisponiveis: Math.max(pool.totalCotas - pool.cotasVendidas, 0),
      valorCota: pool.valorCota.toFixed(2),
      taxaAdministracaoPct: pool.taxaAdministracaoPct.toFixed(2),
      modeloOperacional: pool.modeloOperacional,
      status: pool.status,
      teveGanhador: pool.teveGanhador,
      financeiro: { custoJogos: custoJogos.toFixed(2), receitaPrevista: receitaPrevista.toFixed(2), taxaAdministracaoPrevista: taxaPrevista.toFixed(2), margemOperacionalPrevista: (taxaPrevista - custoJogos).toFixed(2) },
      concurso: pool.concurso ? {
        modalidade: pool.concurso.modalidade,
        numeroConcurso: pool.concurso.numeroConcurso,
        dataSorteio: pool.concurso.dataSorteio,
        cutoffAt: pool.concurso.cutoffAt,
        valorEstimadoPremio: pool.concurso.valorEstimadoPremio?.toFixed(2) ?? null,
        acumulado: pool.concurso.acumulado,
      } : undefined,
      grupo: pool.grupo ? { nome: pool.grupo.nome, slug: pool.grupo.slug, descricao: pool.grupo.descricao } : undefined,
    };
  }
}
