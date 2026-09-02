import { ConflictException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatusBolao, StatusComissao, StatusCota, StatusPagamento } from '@prisma/client';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { AuthUser, assertAdult, isValidCpf, normalizeCpf } from '../auth/auth.utils';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import {
  AdminListQueryDto,
  ApproveAffiliateDto,
  CreateGroupDto,
  CreateInviteDto,
  CreateManagedUserDto,
  CreateAffiliateDto,
  CreatePartnerLotteryDto,
  CreateRemittanceDto,
  DashboardQueryDto,
  OperationReceiptDto,
  PayRemittanceDto,
  UpdateAffiliateCommissionDto,
  UpdateAffiliateNetworkDto,
  UpdateSettingsDto,
  UpdateUserKycDto,
  UpdateUserRoleDto,
} from './admin.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private pagination(query?: AdminListQueryDto) {
    const page = Math.max(1, Number(query?.page ?? 1));
    const pageSize = Math.min(100, Math.max(1, Number(query?.pageSize ?? 25)));
    return { page, pageSize, skip: (page - 1) * pageSize, take: pageSize };
  }

  private dateRange(query?: { de?: string; ate?: string }) {
    const from = query?.de ? new Date(query.de) : undefined;
    const to = query?.ate ? new Date(query.ate) : undefined;
    if (from && Number.isNaN(from.getTime())) return {};
    if (to && Number.isNaN(to.getTime())) return {};
    if (to) to.setHours(23, 59, 59, 999);
    return { ...(from ? { gte: from } : {}), ...(to ? { lte: to } : {}) };
  }

  private periodStart(query?: DashboardQueryDto) {
    const now = new Date();
    if (query?.periodo === 'custom' && query.de) return new Date(query.de);
    if (query?.periodo === 'hoje') {
      const start = new Date(now);
      start.setHours(0, 0, 0, 0);
      return start;
    }
    if (query?.periodo === 'mes') return new Date(now.getFullYear(), now.getMonth(), 1);
    const days = query?.periodo === '7d' ? 7 : 30;
    return new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  }

  async dashboard(query: DashboardQueryDto = {}, user?: AuthUser) {
    const start = this.periodStart(query);
    const end = query.periodo === 'custom' && query.ate ? new Date(query.ate) : new Date();
    end.setHours(23, 59, 59, 999);
    const [
      usuarios,
      boloes,
      cotas,
      recebimentos,
      comissoesPendentes,
      comissoesPagas,
      afiliadosAtivos,
      openPoolStock,
      filaOperacional,
      proximosCutoffs,
      vendasPorDia,
    ] = await Promise.all([
      this.prisma.usuario.count(),
      this.prisma.bolao.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.cota.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.pagamento.aggregate({
        where: { status: StatusPagamento.confirmado, confirmadoEm: { gte: start, lte: end } },
        _sum: { valorBruto: true, valorCustoBilhete: true, valorTaxaAdmin: true, valorComissaoAfiliado: true },
        _count: { _all: true },
      }),
      this.prisma.comissao.aggregate({ where: { status: StatusComissao.pendente }, _sum: { valor: true }, _count: { _all: true } }),
      this.prisma.comissao.aggregate({ where: { status: StatusComissao.paga }, _sum: { valor: true }, _count: { _all: true } }),
      this.prisma.afiliado.count({ where: { statusAprovacao: 'aprovado' } }),
      this.prisma.bolao.findMany({ where: { status: StatusBolao.aberto }, select: { totalCotas: true, cotasVendidas: true, cotasIlimitadas: true } }),
      this.prisma.bolao.count({ where: { status: { in: [StatusBolao.fechado] } } }),
      this.prisma.bolao.findMany({
        where: { status: { in: [StatusBolao.aberto, StatusBolao.fechado] }, concurso: { cutoffAt: { gte: new Date() } } },
        include: { concurso: true, _count: { select: { cotas: true } } },
        orderBy: { concurso: { cutoffAt: 'asc' } },
        take: 6,
      }),
      this.prisma.pagamento.findMany({
        where: { status: StatusPagamento.confirmado, confirmadoEm: { gte: start, lte: end } },
        select: { confirmadoEm: true, valorBruto: true },
        orderBy: { confirmadoEm: 'asc' },
      }),
    ]);

    const poolCounts = Object.fromEntries(boloes.map((row) => [row.status, row._count._all]));
    const shareCounts = Object.fromEntries(cotas.map((row) => [row.status, row._count._all]));
    const groupedSales = new Map<string, { data: string; valor: number; quantidade: number }>();
    for (const payment of vendasPorDia) {
      const key = payment.confirmadoEm?.toISOString().slice(0, 10) ?? 'sem-data';
      const current = groupedSales.get(key) ?? { data: key, valor: 0, quantidade: 0 };
      current.valor += Number(payment.valorBruto);
      current.quantidade += 1;
      groupedSales.set(key, current);
    }

    if (user) {
      await this.audit.record(this.prisma, { entidade: 'financeiro', entidadeId: user.id, evento: 'dashboard.consultado', atorId: user.id, payloadDepois: { inicio: start.toISOString(), fim: end.toISOString() } });
    }

    return {
      periodo: { inicio: start, fim: end },
      kpis: {
        usuarios,
        boloesTotal: Object.values(poolCounts).reduce((sum, value) => sum + Number(value), 0),
        boloesRascunho: poolCounts.rascunho ?? 0,
        boloesAbertos: poolCounts.aberto ?? 0,
        boloesFechados: poolCounts.fechado ?? 0,
        boloesRegistrados: poolCounts.registrado ?? 0,
        boloesApurados: poolCounts.apurado ?? 0,
        cotasDisponiveis: openPoolStock.reduce((sum, pool) => sum + (pool.cotasIlimitadas ? 0 : Math.max((pool.totalCotas ?? 0) - pool.cotasVendidas, 0)), 0),
        cotasReservadas: shareCounts.reservada ?? 0,
        cotasPagas: shareCounts.paga ?? 0,
        cotasRegistradas: shareCounts.registrada ?? 0,
        cotasCanceladas: shareCounts.cancelada ?? 0,
        cotasPremiadas: shareCounts.premiada ?? 0,
        arrecadacao: Number(recebimentos._sum.valorBruto ?? 0).toFixed(2),
        custoJogos: Number(recebimentos._sum.valorCustoBilhete ?? 0).toFixed(2),
        taxasAdministrativas: Number(recebimentos._sum.valorTaxaAdmin ?? 0).toFixed(2),
        comissoesPendentes: Number(comissoesPendentes._sum.valor ?? 0).toFixed(2),
        comissoesPagas: Number(comissoesPagas._sum.valor ?? 0).toFixed(2),
        afiliadosAtivos,
        filaOperacional,
      },
      graficos: { recebimentos: [...groupedSales.values()] },
      proximosCutoffs: proximosCutoffs.map((pool) => ({ id: pool.id, modalidade: pool.concurso.modalidade, concurso: pool.concurso.numeroConcurso, cutoffAt: pool.concurso.cutoffAt, cotas: pool._count.cotas })),
    };
  }

  async listContests(query: AdminListQueryDto = {}) {
    const { page, pageSize, skip, take } = this.pagination(query);
    const dateRange = this.dateRange({ de: query.de, ate: query.ate });
    const where: Prisma.ConcursoWhereInput = {
      ...(query.modalidade ? { modalidade: query.modalidade } : {}),
      ...(query.status ? { status: query.status } : {}),
      ...(Object.keys(dateRange).length ? { dataSorteio: dateRange } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.concurso.findMany({ where, include: { config: true, _count: { select: { boloes: true } } }, orderBy: { dataSorteio: 'asc' }, skip, take }),
      this.prisma.concurso.count({ where }),
    ]);
    return { items, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  async listPools(query: AdminListQueryDto = {}) {
    const { page, pageSize, skip, take } = this.pagination(query);
    const isUuidSearch = Boolean(query.busca && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(query.busca));
    const where: Prisma.BolaoWhereInput = {
      ...(query.status ? { status: query.status as StatusBolao } : {}),
      ...(query.busca ? (isUuidSearch ? { id: query.busca } : { grupo: { nome: { contains: query.busca, mode: 'insensitive' } } }) : {}),
      ...(query.modalidade ? { concurso: { modalidade: query.modalidade } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.bolao.findMany({ where, include: { concurso: true, grupo: true, jogos: { orderBy: { ordem: 'asc' } }, cotas: { select: { status: true, quantidade: true, valorPago: true } } }, orderBy: { criadoEm: 'desc' }, skip, take }),
      this.prisma.bolao.count({ where }),
    ]);
    return {
      items: items.map((pool) => ({
        ...pool,
        valorCota: pool.valorCota.toFixed(2),
        taxaAdministracaoPct: pool.taxaAdministracaoPct.toFixed(2),
        cotas: undefined,
        indicadores: {
          jogos: pool.jogos.length || (pool.numerosApostados.length ? 1 : 0),
          reservadas: pool.cotas.filter((share) => share.status === StatusCota.reservada).reduce((sum, share) => sum + share.quantidade, 0),
          pagas: pool.cotas.filter((share) => share.status === StatusCota.paga).reduce((sum, share) => sum + share.quantidade, 0),
          cotasIlimitadas: pool.cotasIlimitadas,
          disponiveis: pool.cotasIlimitadas ? null : Math.max((pool.totalCotas ?? 0) - pool.cotasVendidas, 0),
          arrecadado: pool.cotas.filter((share) => share.status === StatusCota.paga || share.status === StatusCota.registrada || share.status === StatusCota.apurada || share.status === StatusCota.premiada).reduce((sum, share) => sum + Number(share.valorPago ?? 0), 0).toFixed(2),
          custoJogos: pool.jogos.reduce((sum, game) => sum + Number(game.custo), 0).toFixed(2),
          receitaPrevista: pool.cotasIlimitadas ? null : (pool.valorCota.toNumber() * (pool.totalCotas ?? 0)).toFixed(2),
          taxaPrevista: pool.cotasIlimitadas ? null : (pool.valorCota.toNumber() * (pool.totalCotas ?? 0) * pool.taxaAdministracaoPct.toNumber() / 100).toFixed(2),
        },
      })),
      pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) },
    };
  }

  async listShares(query: AdminListQueryDto = {}) {
    const { page, pageSize, skip, take } = this.pagination(query);
    const where: Prisma.CotaWhereInput = {
      ...(query.status ? { status: query.status as StatusCota } : {}),
      ...(query.busca ? { OR: [{ titularNome: { contains: query.busca, mode: 'insensitive' } }, { titularCpf: { contains: query.busca } }] } : {}),
      ...(query.modalidade ? { bolao: { concurso: { modalidade: query.modalidade } } } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.cota.findMany({ where, include: { comprador: { select: { id: true, nome: true, email: true } }, bolao: { include: { concurso: true } }, afiliadoReferencia: { select: { id: true, codigoAfiliado: true } }, pagamento: true }, orderBy: { criadoEm: 'desc' }, skip, take }),
      this.prisma.cota.count({ where }),
    ]);
    return { items: items.map((share) => ({ ...share, titularCpf: `${share.titularCpf.slice(0, 3)}.***.***-${share.titularCpf.slice(-2)}`, valorPago: share.valorPago?.toFixed(2) ?? null, pagamento: share.pagamento ? { ...share.pagamento, valorBruto: share.pagamento.valorBruto.toFixed(2), valorTaxaAdmin: share.pagamento.valorTaxaAdmin.toFixed(2), valorComissaoAfiliado: share.pagamento.valorComissaoAfiliado.toFixed(2), valorCustoBilhete: share.pagamento.valorCustoBilhete.toFixed(2) } : null })), pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  async listPayments(query: AdminListQueryDto = {}) {
    const { page, pageSize, skip, take } = this.pagination(query);
    const where: Prisma.PagamentoWhereInput = { ...(query.status ? { status: query.status as StatusPagamento } : {}), ...(Object.keys(this.dateRange({ de: query.de, ate: query.ate })).length ? { criadoEm: this.dateRange({ de: query.de, ate: query.ate }) } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.pagamento.findMany({ where, include: { cota: { include: { bolao: { include: { concurso: true } }, comprador: { select: { nome: true, email: true } } } } }, orderBy: { criadoEm: 'desc' }, skip, take }),
      this.prisma.pagamento.count({ where }),
    ]);
    return { items: items.map((payment) => ({ ...payment, valorBruto: payment.valorBruto.toFixed(2), valorTaxaAdmin: payment.valorTaxaAdmin.toFixed(2), valorComissaoAfiliado: payment.valorComissaoAfiliado.toFixed(2), valorCustoBilhete: payment.valorCustoBilhete.toFixed(2) })), pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  async listAffiliates(query: AdminListQueryDto = {}) {
    const { page, pageSize, skip, take } = this.pagination(query);
    const where: Prisma.AfiliadoWhereInput = { ...(query.status ? { statusAprovacao: query.status } : {}), ...(query.busca ? { OR: [{ codigoAfiliado: { contains: query.busca, mode: 'insensitive' } }, { usuario: { nome: { contains: query.busca, mode: 'insensitive' } } }] } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.afiliado.findMany({ where, include: { usuario: { select: { id: true, nome: true, email: true, papel: true } }, parentAfiliado: { include: { usuario: { select: { id: true, nome: true, email: true } } } }, comissoes: { select: { valor: true, status: true } }, _count: { select: { cotasReferenciadas: true, indicados: true, usuariosIndicados: true, grupos: true } } }, orderBy: { criadoEm: 'desc' }, skip, take }),
      this.prisma.afiliado.count({ where }),
    ]);
    return { items: items.map((affiliate) => ({ ...affiliate, comissaoPadraoPct: affiliate.comissaoPadraoPct.toFixed(2), comissoes: undefined, indicadores: { cotas: affiliate._count.cotasReferenciadas, indicados: affiliate._count.indicados, usuariosIndicados: affiliate._count.usuariosIndicados, grupos: affiliate._count.grupos, pendente: affiliate.comissoes.filter((row) => row.status === StatusComissao.pendente).reduce((sum, row) => sum + Number(row.valor), 0).toFixed(2), paga: affiliate.comissoes.filter((row) => row.status === StatusComissao.paga).reduce((sum, row) => sum + Number(row.valor), 0).toFixed(2) } })), pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  async listCommissions(query: AdminListQueryDto = {}) {
    const { page, pageSize, skip, take } = this.pagination(query);
    const where: Prisma.ComissaoWhereInput = { ...(query.status ? { status: query.status as StatusComissao } : {}), ...(query.busca ? { afiliado: { codigoAfiliado: { contains: query.busca, mode: 'insensitive' } } } : {}), ...(Object.keys(this.dateRange({ de: query.de, ate: query.ate })).length ? { criadoEm: this.dateRange({ de: query.de, ate: query.ate }) } : {}) };
    const [items, total] = await Promise.all([
      this.prisma.comissao.findMany({ where, include: { afiliado: { include: { usuario: { select: { nome: true, email: true } } } }, cota: { include: { bolao: { include: { concurso: true } } } }, loteRepasse: true }, orderBy: { criadoEm: 'desc' }, skip, take }),
      this.prisma.comissao.count({ where }),
    ]);
    return { items: items.map((commission) => ({ ...commission, valor: commission.valor.toFixed(2), baseCalculo: commission.baseCalculo?.toFixed(2) ?? null, percentual: commission.percentual?.toFixed(2) ?? null, loteRepasse: commission.loteRepasse ? { id: commission.loteRepasse.id, codigo: commission.loteRepasse.codigo, status: commission.loteRepasse.status } : null })), pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  async listRemittances(query: AdminListQueryDto = {}) {
    const { page, pageSize, skip, take } = this.pagination(query);
    const where: Prisma.RepasseLoteWhereInput = query.status ? { status: query.status } : {};
    const [items, total] = await Promise.all([
      this.prisma.repasseLote.findMany({ where, include: { comissoes: { include: { afiliado: { include: { usuario: { select: { nome: true, email: true } } } } } }, criador: { select: { nome: true } } }, orderBy: { criadoEm: 'desc' }, skip, take }),
      this.prisma.repasseLote.count({ where }),
    ]);
    return { items: items.map((batch) => ({ ...batch, valorTotal: batch.valorTotal.toFixed(2), comissoes: batch.comissoes.map((commission) => ({ id: commission.id, valor: commission.valor.toFixed(2), status: commission.status, afiliado: commission.afiliado.usuario.nome, chavePix: commission.afiliado.chavePixRepasse })) })), pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  async createRemittance(dto: CreateRemittanceDto, user: AuthUser) {
    const commissions = await this.prisma.comissao.findMany({ where: { id: { in: dto.comissaoIds }, status: StatusComissao.pendente, loteRepasseId: null }, include: { afiliado: { include: { usuario: true } } } });
    if (commissions.length !== dto.comissaoIds.length) throw new ConflictException('Uma ou mais comissões não estão pendentes ou já pertencem a outro lote.');
    const total = commissions.reduce((sum, commission) => sum + Number(commission.valor), 0);
    const code = `REP-${new Date().toISOString().slice(0, 10).replace(/-/g, '')}-${Math.random().toString(36).slice(2, 7).toUpperCase()}`;
    const batch = await this.prisma.$transaction(async (tx) => {
      const created = await tx.repasseLote.create({ data: { codigo: code, status: 'rascunho', dataRepasse: dto.dataRepasse ? new Date(dto.dataRepasse) : undefined, valorTotal: new Prisma.Decimal(total), referencia: dto.referencia, comprovanteUrl: dto.comprovanteUrl, observacao: dto.observacao, criadoPor: user.id }, include: { comissoes: true } });
      await tx.comissao.updateMany({ where: { id: { in: dto.comissaoIds }, status: StatusComissao.pendente }, data: { loteRepasseId: created.id } });
      await this.audit.record(tx, { entidade: 'repasse', entidadeId: created.id, evento: 'repasse.lote.criado', atorId: user.id, payloadDepois: { codigo: code, comissaoIds: dto.comissaoIds, valorTotal: total } });
      return created;
    });
    return { ...batch, valorTotal: batch.valorTotal.toFixed(2) };
  }

  async payRemittance(id: string, dto: PayRemittanceDto, user: AuthUser) {
    const current = await this.prisma.repasseLote.findUnique({ where: { id }, include: { comissoes: true } });
    if (!current) throw new NotFoundException('Lote de repasse não encontrado.');
    if (current.status === 'pago') throw new ConflictException('Este lote já foi marcado como pago.');
    const now = dto.dataRepasse ? new Date(dto.dataRepasse) : new Date();
    const result = await this.prisma.$transaction(async (tx) => {
      const batch = await tx.repasseLote.update({ where: { id }, data: { status: 'pago', dataRepasse: now, referencia: dto.referencia ?? current.referencia, comprovanteUrl: dto.comprovanteUrl ?? current.comprovanteUrl, observacao: dto.observacao ?? current.observacao } });
      await tx.comissao.updateMany({ where: { loteRepasseId: id, status: StatusComissao.pendente }, data: { status: StatusComissao.paga, repassadoEm: now, pagoPor: user.id, pagoEm: now } });
      await this.audit.record(tx, { entidade: 'repasse', entidadeId: id, evento: 'repasse.lote.pago', atorId: user.id, payloadAntes: current as unknown as Prisma.InputJsonValue, payloadDepois: batch as unknown as Prisma.InputJsonValue });
      return batch;
    });
    return { ...result, valorTotal: result.valorTotal.toFixed(2) };
  }

  private makeCode(prefix: string): string {
    return `${prefix}-${randomBytes(6).toString('hex').toUpperCase()}`;
  }

  private async requireApprovedAffiliate(user: AuthUser) {
    const affiliate = await this.prisma.afiliado.findUnique({ where: { usuarioId: user.id } });
    if (!affiliate || affiliate.statusAprovacao !== 'aprovado') throw new ForbiddenException('A área de afiliado exige um cadastro aprovado.');
    return affiliate;
  }

  async createManagedUser(dto: CreateManagedUserDto, actor: AuthUser) {
    const cpf = normalizeCpf(dto.cpf);
    if (!isValidCpf(cpf)) throw new ConflictException('CPF inválido.');
    const dataNascimento = new Date(dto.dataNascimento);
    if (Number.isNaN(dataNascimento.getTime())) throw new ConflictException('Data de nascimento inválida.');
    assertAdult(dataNascimento);
    const email = dto.email.trim().toLowerCase();
    const papel = dto.papel ?? 'cotista';
    const parent = dto.parentAfiliadoId ? await this.prisma.afiliado.findFirst({ where: { id: dto.parentAfiliadoId, statusAprovacao: 'aprovado' } }) : null;
    if (dto.parentAfiliadoId && !parent) throw new NotFoundException('Afiliado-pai aprovado não encontrado.');
    const existing = await this.prisma.usuario.findFirst({ where: { OR: [{ cpf }, { email }] }, select: { id: true } });
    if (existing) throw new ConflictException('CPF ou e-mail já cadastrado.');
    const passwordHash = await argon2.hash(dto.senha, { type: argon2.argon2id });
    const created = await this.prisma.$transaction(async (tx) => {
      const user = await tx.usuario.create({ data: { nome: dto.nome.trim(), cpf, email, telefone: dto.telefone?.trim() || undefined, dataNascimento, senhaHash: passwordHash, papel } });
      const affiliate = papel === 'afiliado'
        ? await tx.afiliado.create({ data: { usuarioId: user.id, codigoAfiliado: this.makeCode('BL'), statusAprovacao: 'aprovado', comissaoPadraoPct: new Prisma.Decimal(dto.comissaoPadraoPct ?? 10), parentAfiliadoId: parent?.id, aprovadoPor: actor.id, aprovadoEm: new Date() } })
        : null;
      await this.audit.record(tx, { entidade: 'usuario', entidadeId: user.id, evento: 'usuario.criado.admin', atorId: actor.id, payloadDepois: { id: user.id, email: user.email, papel: user.papel, afiliadoId: affiliate?.id ?? null, parentAfiliadoId: parent?.id ?? null } });
      return { user, affiliate };
    });
    return { usuario: { id: created.user.id, nome: created.user.nome, cpf: this.maskCpf(created.user.cpf), email: created.user.email, papel: created.user.papel, criadoEm: created.user.criadoEm }, afiliado: created.affiliate ? { id: created.affiliate.id, codigoAfiliado: created.affiliate.codigoAfiliado, statusAprovacao: created.affiliate.statusAprovacao, parentAfiliadoId: created.affiliate.parentAfiliadoId } : null };
  }

  async createInvite(dto: CreateInviteDto, actor: AuthUser) {
    const actorAffiliate = actor.papel === 'afiliado' ? await this.requireApprovedAffiliate(actor) : null;
    const requestedOrigin = dto.afiliadoOrigemId ? await this.prisma.afiliado.findFirst({ where: { id: dto.afiliadoOrigemId, statusAprovacao: 'aprovado' } }) : null;
    if (dto.afiliadoOrigemId && !requestedOrigin) throw new NotFoundException('Afiliado de origem não encontrado ou não aprovado.');
    if (actorAffiliate && requestedOrigin && requestedOrigin.id !== actorAffiliate.id) throw new ForbiddenException('Um afiliado só pode gerar convites na própria rede.');
    const origin = requestedOrigin ?? actorAffiliate;
    const expiresAt = dto.expiraEm ? new Date(dto.expiraEm) : new Date(Date.now() + 30 * 24 * 60 * 60 * 1000);
    if (Number.isNaN(expiresAt.getTime()) || expiresAt <= new Date()) throw new ConflictException('A validade do convite precisa estar no futuro.');
    const invite = await this.prisma.$transaction(async (tx) => {
      const created = await tx.convite.create({ data: { codigo: this.makeCode(dto.tipo === 'afiliado' ? 'AF' : 'USR'), tipo: dto.tipo, criadoPorUsuarioId: actor.id, afiliadoOrigemId: origin?.id, emailDestino: dto.emailDestino?.trim().toLowerCase() || undefined, expiraEm: expiresAt } });
      await this.audit.record(tx, { entidade: 'convite', entidadeId: created.id, evento: 'convite.criado', atorId: actor.id, payloadDepois: { codigo: created.codigo, tipo: created.tipo, afiliadoOrigemId: created.afiliadoOrigemId, expiraEm: created.expiraEm } });
      return created;
    });
    return { id: invite.id, codigo: invite.codigo, tipo: invite.tipo, status: invite.status, expiraEm: invite.expiraEm, caminho: `/r/${invite.codigo}` };
  }

  async listInvites(query: AdminListQueryDto = {}, actor: AuthUser) {
    const { page, pageSize, skip, take } = this.pagination(query);
    const where: Prisma.ConviteWhereInput = {
      ...(actor.papel === 'afiliado' ? { afiliadoOrigemId: (await this.requireApprovedAffiliate(actor)).id } : {}),
      ...(query.status ? { status: query.status as any } : {}),
      ...(query.busca ? { OR: [{ codigo: { contains: query.busca, mode: 'insensitive' } }, { emailDestino: { contains: query.busca, mode: 'insensitive' } }] } : {}),
    };
    const [items, total] = await Promise.all([
      this.prisma.convite.findMany({ where, include: { afiliadoOrigem: { include: { usuario: { select: { nome: true, email: true } } } }, usadoPorUsuario: { select: { nome: true, email: true } } }, orderBy: { criadoEm: 'desc' }, skip, take }),
      this.prisma.convite.count({ where }),
    ]);
    return { items: items.map((invite) => ({ id: invite.id, codigo: invite.codigo, tipo: invite.tipo, status: invite.status, emailDestino: invite.emailDestino, expiraEm: invite.expiraEm, usadoEm: invite.usadoEm, afiliadoOrigem: invite.afiliadoOrigem ? { id: invite.afiliadoOrigem.id, codigo: invite.afiliadoOrigem.codigoAfiliado, nome: invite.afiliadoOrigem.usuario.nome } : null, usadoPor: invite.usadoPorUsuario })), pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  async affiliateNetwork(actor: AuthUser) {
    const root = await this.requireApprovedAffiliate(actor);
    const nodes: Array<Record<string, unknown>> = [];
    let frontier = [root.id];
    for (let depth = 1; depth <= 10 && frontier.length; depth += 1) {
      const children = await this.prisma.afiliado.findMany({ where: { parentAfiliadoId: { in: frontier } }, include: { usuario: { select: { id: true, nome: true, email: true, criadoEm: true } }, _count: { select: { indicados: true, usuariosIndicados: true, grupos: true, cotasReferenciadas: true } } }, orderBy: { criadoEm: 'asc' } });
      nodes.push(...children.map((child) => ({ id: child.id, parentAfiliadoId: child.parentAfiliadoId, codigoAfiliado: child.codigoAfiliado, statusAprovacao: child.statusAprovacao, depth, usuario: child.usuario, indicadores: child._count })));
      frontier = children.map((child) => child.id);
    }
    const own = await this.prisma.afiliado.findUniqueOrThrow({ where: { id: root.id }, include: { usuario: { select: { id: true, nome: true, email: true } }, _count: { select: { indicados: true, usuariosIndicados: true, grupos: true, cotasReferenciadas: true } } } });
    return { raiz: { id: own.id, codigoAfiliado: own.codigoAfiliado, usuario: own.usuario, indicadores: own._count }, descendentes: nodes, totalDescendentes: nodes.length };
  }

  async affiliateWorkspace(actor: AuthUser) {
    const affiliate = await this.requireApprovedAffiliate(actor);
    const [groups, pools, invites] = await Promise.all([
      this.prisma.grupo.findMany({ where: { afiliadoId: affiliate.id }, orderBy: { criadoEm: 'desc' }, include: { _count: { select: { boloes: true } } } }),
      this.prisma.bolao.findMany({ where: { criadoPor: actor.id }, include: { concurso: true, grupo: true, jogos: { orderBy: { ordem: 'asc' } } }, orderBy: { criadoEm: 'desc' }, take: 100 }),
      this.prisma.convite.findMany({ where: { afiliadoOrigemId: affiliate.id }, orderBy: { criadoEm: 'desc' }, take: 100 }),
    ]);
    return { afiliado: { id: affiliate.id, codigoAfiliado: affiliate.codigoAfiliado, statusAprovacao: affiliate.statusAprovacao }, grupos: groups, boloes: pools.map((pool) => this.toPublicPool(pool)), convites: invites.map((invite) => ({ id: invite.id, codigo: invite.codigo, tipo: invite.tipo, status: invite.status, expiraEm: invite.expiraEm, caminho: `/r/${invite.codigo}` })) };
  }

  async createGroup(dto: CreateGroupDto, actor: AuthUser) {
    const affiliate = actor.papel === 'afiliado' ? await this.requireApprovedAffiliate(actor) : null;
    const affiliateId = affiliate?.id ?? dto.afiliadoId;
    if (actor.papel === 'admin' && dto.afiliadoId) {
      const target = await this.prisma.afiliado.findFirst({ where: { id: dto.afiliadoId, statusAprovacao: 'aprovado' } });
      if (!target) throw new NotFoundException('Afiliado aprovado não encontrado.');
    }
    const slug = dto.slug.trim().toLowerCase().replace(/\s+/g, '-').replace(/[^a-z0-9-]/g, '').replace(/-+/g, '-');
    if (!slug) throw new ConflictException('Slug do grupo inválido.');
    const exists = await this.prisma.grupo.findUnique({ where: { slug } });
    if (exists) throw new ConflictException('Slug de grupo já utilizado.');
    const group = await this.prisma.$transaction(async (tx) => {
      const created = await tx.grupo.create({ data: { nome: dto.nome.trim(), slug, descricao: dto.descricao?.trim() || undefined, tipo: affiliateId ? 'afiliado' : 'oficial', afiliadoId: affiliateId, criadoPor: actor.id } });
      await this.audit.record(tx, { entidade: 'grupo', entidadeId: created.id, evento: 'grupo.criado', atorId: actor.id, payloadDepois: created as unknown as Prisma.InputJsonValue });
      return created;
    });
    return group;
  }

  async listGroups(query: AdminListQueryDto = {}, actor: AuthUser) {
    const { page, pageSize, skip, take } = this.pagination(query);
    const where: Prisma.GrupoWhereInput = actor.papel === 'afiliado' ? { afiliadoId: (await this.requireApprovedAffiliate(actor)).id } : { ...(query.busca ? { OR: [{ nome: { contains: query.busca, mode: 'insensitive' } }, { slug: { contains: query.busca, mode: 'insensitive' } }] } : {}) };
    const [items, total] = await Promise.all([this.prisma.grupo.findMany({ where, include: { afiliado: { include: { usuario: { select: { nome: true } } } }, _count: { select: { boloes: true } } }, orderBy: { criadoEm: 'desc' }, skip, take }), this.prisma.grupo.count({ where })]);
    return { items, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  private maskCpf(cpf: string): string {
    return cpf.length === 11 ? `${cpf.slice(0, 3)}.***.***-${cpf.slice(-2)}` : '***';
  }

  private toPublicPool(pool: any) {
    const games = Array.isArray(pool.jogos) ? pool.jogos.map((game: any) => ({ id: game.id, ordem: game.ordem, numeros: game.numeros, quantidadeDezenas: game.quantidadeDezenas, custo: Number(game.custo ?? 0).toFixed(2), status: game.status })) : [];
    return { id: pool.id, concursoId: pool.concursoId, grupoId: pool.grupoId, totalCotas: pool.cotasIlimitadas ? null : pool.totalCotas, cotasIlimitadas: pool.cotasIlimitadas, cotasVendidas: pool.cotasVendidas, cotasDisponiveis: pool.cotasIlimitadas ? null : Math.max((pool.totalCotas ?? 0) - pool.cotasVendidas, 0), valorCota: pool.valorCota?.toFixed?.(2) ?? String(pool.valorCota), taxaAdministracaoPct: pool.taxaAdministracaoPct?.toFixed?.(2) ?? String(pool.taxaAdministracaoPct), status: pool.status, tipoOrganizador: pool.tipoOrganizador, jogos: games, concurso: pool.concurso ? { modalidade: pool.concurso.modalidade, numeroConcurso: pool.concurso.numeroConcurso, dataSorteio: pool.concurso.dataSorteio, cutoffAt: pool.concurso.cutoffAt, valorEstimadoPremio: pool.concurso.valorEstimadoPremio?.toFixed?.(2) ?? null } : null, grupo: pool.grupo ? { id: pool.grupo.id, nome: pool.grupo.nome, slug: pool.grupo.slug } : null };
  }

  async listUsers(query: AdminListQueryDto = {}) {
    const { page, pageSize, skip, take } = this.pagination(query);
    const where: Prisma.UsuarioWhereInput = query.busca ? { OR: [{ nome: { contains: query.busca, mode: 'insensitive' } }, { email: { contains: query.busca, mode: 'insensitive' } }, { cpf: { contains: query.busca } }] } : {};
    const [items, total] = await Promise.all([
      this.prisma.usuario.findMany({ where, select: { id: true, nome: true, cpf: true, email: true, telefone: true, papel: true, statusKyc: true, criadoEm: true, afiliado: { select: { id: true, codigoAfiliado: true, statusAprovacao: true, parentAfiliadoId: true } }, _count: { select: { cotasCompradas: true, auditorias: true } } }, orderBy: { criadoEm: 'desc' }, skip, take }),
      this.prisma.usuario.count({ where }),
    ]);
    return { items: items.map((item) => ({ ...item, cpf: this.maskCpf(item.cpf) })), pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  async updateUserRole(id: string, dto: UpdateUserRoleDto, user: AuthUser) {
    if (id === user.id && dto.papel !== 'admin') throw new ConflictException('O administrador não pode remover o próprio acesso.');
    const target = await this.prisma.usuario.findUnique({ where: { id }, select: { id: true, nome: true, email: true, papel: true } });
    if (!target) throw new NotFoundException('Usuário não encontrado.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.usuario.update({ where: { id }, data: { papel: dto.papel } });
      const affiliate = await tx.afiliado.findUnique({ where: { usuarioId: id } });
      if (dto.papel === 'afiliado' && !affiliate) {
        await tx.afiliado.create({ data: { usuarioId: id, codigoAfiliado: this.makeCode('BL'), statusAprovacao: 'aprovado', aprovadoPor: user.id, aprovadoEm: new Date() } });
      } else if (dto.papel !== 'afiliado' && affiliate && affiliate.statusAprovacao !== 'inativo') {
        await tx.afiliado.update({ where: { id: affiliate.id }, data: { statusAprovacao: 'inativo' } });
      }
      await this.audit.record(tx, { entidade: 'usuario', entidadeId: id, evento: 'usuario.papel.alterado', atorId: user.id, payloadAntes: target as unknown as Prisma.InputJsonValue, payloadDepois: { id: result.id, papel: result.papel } });
      return result;
    });
    return { id: updated.id, papel: updated.papel };
  }

  async updateUserKyc(id: string, dto: UpdateUserKycDto, user: AuthUser) {
    const target = await this.prisma.usuario.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Usuário não encontrado.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.usuario.update({ where: { id }, data: { statusKyc: dto.statusKyc } });
      await this.audit.record(tx, { entidade: 'usuario', entidadeId: id, evento: 'usuario.kyc.alterado', atorId: user.id, payloadAntes: target as unknown as Prisma.InputJsonValue, payloadDepois: result as unknown as Prisma.InputJsonValue });
      return result;
    });
    return { id: updated.id, statusKyc: updated.statusKyc };
  }

  async listOperations(query: AdminListQueryDto = {}) {
    const where: Prisma.BolaoWhereInput = { status: query.status ? query.status as StatusBolao : { in: [StatusBolao.aberto, StatusBolao.fechado, StatusBolao.registrado] }, ...(query.modalidade ? { concurso: { modalidade: query.modalidade } } : {}) };
    const items = await this.prisma.bolao.findMany({ where, include: { concurso: true, lotericaParceira: true, jogos: { orderBy: { ordem: 'asc' } }, cotas: { where: { status: { in: [StatusCota.paga, StatusCota.registrada] } }, select: { quantidade: true, valorPago: true } } }, orderBy: { concurso: { cutoffAt: 'asc' } }, take: 100 });
    return items.map((pool) => ({ id: pool.id, modalidade: pool.concurso.modalidade, concurso: pool.concurso.numeroConcurso, jogos: pool.jogos.length || (pool.numerosApostados.length ? 1 : 0), cotasPagas: pool.cotas.reduce((sum, share) => sum + share.quantidade, 0), arrecadacao: pool.cotas.reduce((sum, share) => sum + Number(share.valorPago ?? 0), 0).toFixed(2), cutoffAt: pool.concurso.cutoffAt, parceiro: pool.lotericaParceira?.razaoSocial ?? null, status: pool.status, comprovanteUrl: pool.comprovanteUrl }));
  }

  async listPartners(query: AdminListQueryDto = {}) {
    const { page, pageSize, skip, take } = this.pagination(query);
    const where: Prisma.LotericaParceiraWhereInput = query.busca ? { OR: [{ razaoSocial: { contains: query.busca, mode: 'insensitive' } }, { cnpj: { contains: query.busca } }] } : {};
    const [items, total] = await Promise.all([this.prisma.lotericaParceira.findMany({ where, include: { usuarioOperacional: { select: { nome: true, email: true } }, _count: { select: { boloes: true } } }, orderBy: { criadoEm: 'desc' }, skip, take }), this.prisma.lotericaParceira.count({ where })]);
    return { items: items.map((partner) => ({ ...partner, percentualRepasse: partner.percentualRepasse.toFixed(2) })), pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  async listAudits(query: AdminListQueryDto = {}) {
    const { page, pageSize, skip, take } = this.pagination(query);
    const where: Prisma.AuditoriaEventoWhereInput = { ...(query.status ? { evento: { contains: query.status, mode: 'insensitive' } } : {}), ...(query.busca ? { entidade: { contains: query.busca, mode: 'insensitive' } } : {}), ...(Object.keys(this.dateRange({ de: query.de, ate: query.ate })).length ? { criadoEm: this.dateRange({ de: query.de, ate: query.ate }) } : {}) };
    const [items, total] = await Promise.all([this.prisma.auditoriaEvento.findMany({ where, include: { ator: { select: { nome: true, email: true } } }, orderBy: { criadoEm: 'desc' }, skip, take }), this.prisma.auditoriaEvento.count({ where })]);
    return { items, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  async createPartner(dto: CreatePartnerLotteryDto, user: AuthUser) {
    const exists = await this.prisma.lotericaParceira.findUnique({ where: { cnpj: dto.cnpj.replace(/\D/g, '') } });
    if (exists) throw new ConflictException('CNPJ já cadastrado.');
    const partner = await this.prisma.lotericaParceira.create({ data: { razaoSocial: dto.razaoSocial, cnpj: dto.cnpj.replace(/\D/g, ''), codigoCaixa: dto.codigoCaixa, cidade: dto.cidade, uf: dto.uf.toUpperCase(), percentualRepasse: new Prisma.Decimal(dto.percentualRepasse), usuarioOperacionalId: dto.usuarioOperacionalId } });
    await this.audit.record(this.prisma, { entidade: 'loterica_parceira', entidadeId: partner.id, evento: 'loterica.criada', atorId: user.id, payloadDepois: partner as unknown as Prisma.InputJsonValue });
    return partner;
  }

  async requestAffiliate(user: AuthUser, dto: CreateAffiliateDto) {
    const existing = await this.prisma.afiliado.findUnique({ where: { usuarioId: user.id } });
    if (existing) throw new ConflictException('Solicitação de afiliado já existe.');
    const affiliate = await this.prisma.afiliado.create({ data: { usuarioId: user.id, codigoAfiliado: `af-${user.id.slice(0, 8)}` } });
    await this.audit.record(this.prisma, { entidade: 'afiliado', entidadeId: affiliate.id, evento: 'afiliado.solicitado', atorId: user.id, payloadDepois: { contato: dto.emailContato ?? null } });
    return affiliate;
  }

  async approveAffiliate(id: string, dto: ApproveAffiliateDto, user: AuthUser) {
    const affiliate = await this.prisma.afiliado.findUnique({ where: { id }, include: { usuario: true } });
    if (!affiliate) throw new NotFoundException('Afiliado não encontrado.');
    const result = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.afiliado.update({ where: { id }, data: { statusAprovacao: 'aprovado', comissaoPadraoPct: new Prisma.Decimal(dto.comissaoPadraoPct), aprovadoPor: user.id, aprovadoEm: new Date() } });
      await tx.usuario.update({ where: { id: affiliate.usuarioId }, data: { papel: 'afiliado' } });
      await this.audit.record(tx, { entidade: 'afiliado', entidadeId: id, evento: 'afiliado.aprovado', atorId: user.id, payloadAntes: affiliate as unknown as Prisma.InputJsonValue, payloadDepois: { ...updated, usuarioPapel: 'afiliado' } as unknown as Prisma.InputJsonValue });
      return updated;
    });
    return result;
  }

  async updateAffiliateNetwork(id: string, dto: UpdateAffiliateNetworkDto, user: AuthUser) {
    const target = await this.prisma.afiliado.findUnique({ where: { id }, select: { id: true, parentAfiliadoId: true } });
    if (!target) throw new NotFoundException('Afiliado não encontrado.');
    if (dto.parentAfiliadoId === id) throw new ConflictException('Um afiliado não pode ser pai de si mesmo.');
    if (dto.parentAfiliadoId) {
      const parent = await this.prisma.afiliado.findFirst({ where: { id: dto.parentAfiliadoId, statusAprovacao: 'aprovado' }, select: { id: true, parentAfiliadoId: true } });
      if (!parent) throw new NotFoundException('Afiliado-pai aprovado não encontrado.');
      let cursor = parent.parentAfiliadoId;
      for (let depth = 0; cursor && depth < 100; depth += 1) {
        if (cursor === id) throw new ConflictException('A alteração criaria um ciclo na rede de afiliados.');
        const ancestor = await this.prisma.afiliado.findUnique({ where: { id: cursor }, select: { parentAfiliadoId: true } });
        cursor = ancestor?.parentAfiliadoId ?? null;
      }
    }
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.afiliado.update({ where: { id }, data: { parentAfiliadoId: dto.parentAfiliadoId ?? null } });
      await this.audit.record(tx, { entidade: 'afiliado', entidadeId: id, evento: 'afiliado.rede.alterada', atorId: user.id, payloadAntes: target as unknown as Prisma.InputJsonValue, payloadDepois: result as unknown as Prisma.InputJsonValue });
      return result;
    });
    return { id: updated.id, parentAfiliadoId: updated.parentAfiliadoId };
  }

  async updateAffiliateCommission(id: string, dto: UpdateAffiliateCommissionDto, user: AuthUser) {
    const affiliate = await this.prisma.afiliado.findUnique({ where: { id } });
    if (!affiliate) throw new NotFoundException('Afiliado não encontrado.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.afiliado.update({ where: { id }, data: { comissaoPadraoPct: new Prisma.Decimal(dto.comissaoPadraoPct) } });
      await this.audit.record(tx, { entidade: 'afiliado', entidadeId: id, evento: 'afiliado.comissao.alterada', atorId: user.id, payloadAntes: affiliate as unknown as Prisma.InputJsonValue, payloadDepois: result as unknown as Prisma.InputJsonValue });
      return result;
    });
    return updated;
  }

  async affiliateDashboard(user: AuthUser) {
    const affiliate = await this.prisma.afiliado.findUnique({ where: { usuarioId: user.id }, include: { comissoes: true, _count: { select: { cotasReferenciadas: true, usuariosIndicados: true } } } });
    if (!affiliate) throw new NotFoundException('Usuário ainda não possui cadastro de afiliado.');
    const [volume, participants] = await Promise.all([
      this.prisma.cota.aggregate({ where: { afiliadoReferenciaId: affiliate.id, status: { in: [StatusCota.paga, StatusCota.registrada, StatusCota.apurada, StatusCota.premiada] } }, _sum: { valorPago: true } }),
      this.prisma.cota.findMany({ where: { afiliadoReferenciaId: affiliate.id }, select: { compradorId: true }, distinct: ['compradorId'] }),
    ]);
    const pending = affiliate.comissoes.filter((commission) => commission.status === StatusComissao.pendente).reduce((sum, commission) => sum + Number(commission.valor), 0);
    const paid = affiliate.comissoes.filter((commission) => commission.status === StatusComissao.paga).reduce((sum, commission) => sum + Number(commission.valor), 0);
    return { codigoAfiliado: affiliate.codigoAfiliado, statusAprovacao: affiliate.statusAprovacao, cadastrosAtribuidos: affiliate._count.usuariosIndicados, participantes: participants.length, cotas: affiliate._count.cotasReferenciadas, volume: Number(volume._sum.valorPago ?? 0).toFixed(2), comissaoPendente: pending.toFixed(2), comissaoPaga: paid.toFixed(2), totalComissoes: affiliate.comissoes.length };
  }

  async affiliateCommissions(user: AuthUser) {
    const affiliate = await this.prisma.afiliado.findUnique({ where: { usuarioId: user.id } });
    if (!affiliate) throw new NotFoundException('Afiliado não encontrado.');
    const commissions = await this.prisma.comissao.findMany({ where: { afiliadoId: affiliate.id }, orderBy: { criadoEm: 'desc' }, select: { id: true, cotaId: true, valor: true, baseCalculo: true, percentual: true, status: true, repassadoEm: true, loteRepasseId: true, criadoEm: true } });
    return commissions.map((commission) => ({ ...commission, valor: commission.valor.toFixed(2), baseCalculo: commission.baseCalculo?.toFixed(2) ?? null, percentual: commission.percentual?.toFixed(2) ?? null }));
  }

  async financialReconciliation(user: AuthUser) {
    const payments = await this.prisma.pagamento.findMany({ where: { status: StatusPagamento.confirmado }, select: { valorBruto: true, valorTaxaAdmin: true, valorCustoBilhete: true, valorComissaoAfiliado: true } });
    const totals = payments.reduce((acc, payment) => ({ gross: acc.gross + Number(payment.valorBruto), fees: acc.fees + Number(payment.valorTaxaAdmin), cost: acc.cost + Number(payment.valorCustoBilhete), commissions: acc.commissions + Number(payment.valorComissaoAfiliado) }), { gross: 0, fees: 0, cost: 0, commissions: 0 });
    await this.audit.record(this.prisma, { entidade: 'financeiro', entidadeId: user.id, evento: 'financeiro.consultado', atorId: user.id, payloadDepois: totals });
    return { valorArrecadado: totals.gross.toFixed(2), taxaAdministracao: totals.fees.toFixed(2), custoBilhetes: totals.cost.toFixed(2), comissoes: totals.commissions.toFixed(2), conciliado: Math.abs(totals.gross - totals.cost - totals.fees - totals.commissions) < 0.01 };
  }

  async updateSettings(dto: UpdateSettingsDto, user: AuthUser) {
    const changes = { prazoReservaMinutos: dto.prazoReservaMinutos, comissaoPadraoPct: dto.comissaoPadraoPct, pagamentosHabilitados: dto.pagamentosHabilitados };
    await this.audit.record(this.prisma, { entidade: 'configuracao', entidadeId: user.id, evento: 'configuracao.atualizada', atorId: user.id, payloadDepois: changes });
    return { ...changes, observacao: 'Variáveis operacionais sensíveis continuam administradas pelo ambiente de produção.' };
  }

  async registerOperationReceipt(id: string, dto: OperationReceiptDto, user: AuthUser) {
    const pool = await this.prisma.bolao.findUnique({ where: { id }, include: { cotas: true } });
    if (!pool) throw new NotFoundException('Bolão não encontrado.');
    if (([StatusBolao.fechado, StatusBolao.registrado] as StatusBolao[]).includes(pool.status) === false) throw new ConflictException('O bolão precisa estar fechado ou registrado para receber comprovante.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.bolao.update({ where: { id }, data: { comprovanteUrl: dto.comprovanteUrl, status: StatusBolao.registrado, registradoEm: new Date() } });
      await tx.cota.updateMany({ where: { bolaoId: id, status: StatusCota.paga }, data: { status: StatusCota.registrada, comprovanteIndividualUrl: dto.comprovanteUrl } });
      await this.audit.record(tx, { entidade: 'bolao', entidadeId: id, evento: 'bolao.comprovante.vinculado', atorId: user.id, payloadAntes: pool as unknown as Prisma.InputJsonValue, payloadDepois: { ...result, hashArquivo: dto.hashArquivo ?? null, observacao: dto.observacao ?? null } as unknown as Prisma.InputJsonValue });
      return result;
    });
    return { id: updated.id, status: updated.status, comprovanteUrl: updated.comprovanteUrl };
  }
}
