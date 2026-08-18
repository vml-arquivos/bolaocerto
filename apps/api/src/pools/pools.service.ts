import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatusBolao } from '@prisma/client';
import { AuthUser } from '../auth/auth.utils';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { CreatePoolDto, UpdatePoolDto } from './pools.dto';

@Injectable()
export class PoolsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async listPublic() {
    const pools = await this.prisma.bolao.findMany({
      where: { status: { in: [StatusBolao.aberto, StatusBolao.fechado, StatusBolao.registrado, StatusBolao.apurado] } },
      include: { concurso: true, grupo: true },
      orderBy: { criadoEm: 'desc' },
      take: 100,
    });
    return pools.map((pool) => this.toPublic(pool));
  }

  async getPublicById(id: string) {
    const pool = await this.prisma.bolao.findUnique({ where: { id }, include: { concurso: true, grupo: true } });
    if (!pool) throw new NotFoundException('Bolão não encontrado.');
    return this.toPublic(pool);
  }

  async getGroupBySlug(slug: string) {
    const group = await this.prisma.grupo.findUnique({ where: { slug }, include: { boloes: { include: { concurso: true, grupo: true }, orderBy: { criadoEm: 'desc' } } } });
    if (!group) throw new NotFoundException('Grupo não encontrado.');
    return { id: group.id, nome: group.nome, slug: group.slug, tipo: group.tipo, descricao: group.descricao, boloes: group.boloes.map((pool) => this.toPublic(pool)) };
  }

  async create(dto: CreatePoolDto, user: AuthUser) {
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
    const group = await this.prisma.grupo.findUnique({ where: { id: dto.grupoId } });
    if (!group) throw new NotFoundException('Grupo não encontrado.');
    if (user.papel === 'afiliado' && group.tipo !== 'afiliado') throw new ForbiddenException('Afiliado só pode criar bolões em grupos de afiliado.');
    const pool = await this.prisma.bolao.create({
      data: {
        concursoId: dto.concursoId,
        grupoId: dto.grupoId,
        criadoPor: user.id,
        tipoOrganizador: user.papel === 'afiliado' ? 'afiliado' : 'admin',
        numerosApostados: dto.numerosApostados,
        totalCotas: dto.totalCotas,
        valorCota: new Prisma.Decimal(dto.valorCota),
        taxaAdministracaoPct: new Prisma.Decimal(dto.taxaAdministracaoPct),
        modeloOperacional: dto.modeloOperacional,
        lotericaParceiraId: dto.lotericaParceiraId,
      },
    });
    await this.audit.record(this.prisma, { entidade: 'bolao', entidadeId: pool.id, evento: 'bolao.criado', atorId: user.id, payloadDepois: pool as unknown as Prisma.InputJsonValue });
    return this.getPublicById(pool.id);
  }

  async update(id: string, dto: UpdatePoolDto, user: AuthUser) {
    const pool = await this.prisma.bolao.findUnique({ where: { id }, include: { cotas: true } });
    if (!pool) throw new NotFoundException('Bolão não encontrado.');
    if (user.papel !== 'admin' && pool.criadoPor !== user.id) throw new ForbiddenException('Sem permissão para editar este bolão.');
    const editableStatuses: StatusBolao[] = [StatusBolao.rascunho, StatusBolao.aberto];
    if (!editableStatuses.includes(pool.status)) throw new ConflictException('Bolão não pode mais ser editado neste estado.');
    const hasPaid = pool.cotas.some((share) => ['paga', 'registrada', 'apurada', 'premiada'].includes(share.status));
    const sensitiveChanged = dto.numerosApostados !== undefined || dto.totalCotas !== undefined || dto.valorCota !== undefined || dto.taxaAdministracaoPct !== undefined;
    if (hasPaid && sensitiveChanged) throw new ConflictException('Campos sensíveis não podem ser alterados após confirmação de pagamento.');
    if (dto.totalCotas !== undefined && dto.totalCotas < pool.cotasVendidas) throw new ConflictException('Total de cotas não pode ficar abaixo das cotas já vendidas.');
    const before = pool as unknown as Prisma.InputJsonValue;
    const updated = await this.prisma.bolao.update({ where: { id }, data: {
      numerosApostados: dto.numerosApostados,
      totalCotas: dto.totalCotas,
      valorCota: dto.valorCota === undefined ? undefined : new Prisma.Decimal(dto.valorCota),
      taxaAdministracaoPct: dto.taxaAdministracaoPct === undefined ? undefined : new Prisma.Decimal(dto.taxaAdministracaoPct),
      editadoPor: user.id,
      editadoEm: new Date(),
    } });
    if (dto.descricao !== undefined) await this.prisma.grupo.update({ where: { id: pool.grupoId }, data: { descricao: dto.descricao } });
    await this.audit.record(this.prisma, { entidade: 'bolao', entidadeId: id, evento: 'bolao.editado', atorId: user.id, payloadAntes: before, payloadDepois: updated as unknown as Prisma.InputJsonValue });
    return this.getPublicById(id);
  }

  async cancel(id: string, user: AuthUser) {
    const pool = await this.prisma.bolao.findUnique({ where: { id }, include: { cotas: true } });
    if (!pool) throw new NotFoundException('Bolão não encontrado.');
    if (pool.status === StatusBolao.registrado || pool.status === StatusBolao.apurado) throw new ConflictException('Bolão registrado não pode ser cancelado por esta operação.');
    const paid = pool.cotas.some((share) => share.status === 'paga');
    if (paid) throw new ConflictException('Existem cotas pagas; execute o fluxo de estorno do provedor antes de cancelar.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const cancelled = await tx.bolao.update({ where: { id }, data: { status: StatusBolao.cancelado } });
      await this.audit.record(tx, { entidade: 'bolao', entidadeId: id, evento: 'bolao.cancelado', atorId: user.id, payloadDepois: cancelled as unknown as Prisma.InputJsonValue });
      return cancelled;
    });
    return { id: updated.id, status: updated.status };
  }

  private toPublic(pool: { id: string; concursoId: string; grupoId: string; numerosApostados: number[]; totalCotas: number; cotasVendidas: number; valorCota: Prisma.Decimal; taxaAdministracaoPct: Prisma.Decimal; modeloOperacional: string; status: StatusBolao; teveGanhador: boolean }) {
    return {
      id: pool.id,
      concursoId: pool.concursoId,
      grupoId: pool.grupoId,
      numerosApostados: pool.numerosApostados,
      totalCotas: pool.totalCotas,
      cotasDisponiveis: Math.max(pool.totalCotas - pool.cotasVendidas, 0),
      valorCota: pool.valorCota.toFixed(2),
      taxaAdministracaoPct: pool.taxaAdministracaoPct.toFixed(2),
      modeloOperacional: pool.modeloOperacional,
      status: pool.status,
      teveGanhador: pool.teveGanhador,
    };
  }
}
