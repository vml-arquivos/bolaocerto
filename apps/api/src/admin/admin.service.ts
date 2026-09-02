import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatusBolao, StatusComissao, StatusCota, StatusPagamento } from '@prisma/client';
import { AuthUser } from '../auth/auth.utils';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import {
  AdminListQueryDto,
  ApproveAffiliateDto,
  CreateAffiliateDto,
  CreatePartnerLotteryDto,
  CreateRemittanceDto,
  DashboardQueryDto,
  OperationReceiptDto,
  PayRemittanceDto,
  UpdateAffiliateCommissionDto,
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
      this.prisma.bolao.findMany({ where: { status: StatusBolao.aberto }, select: { totalCotas: true, cotasVendidas: true } }),
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
        cotasDisponiveis: openPoolStock.reduce((sum, pool) => sum + Math.max(pool.totalCotas - pool.cotasVendidas, 0), 0),
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
          disponiveis: Math.max(pool.totalCotas - pool.cotasVendidas, 0),
          arrecadado: pool.cotas.filter((share) => share.status === StatusCota.paga || share.status === StatusCota.registrada || share.status === StatusCota.apurada || share.status === StatusCota.premiada).reduce((sum, share) => sum + Number(share.valorPago ?? 0), 0).toFixed(2),
          custoJogos: pool.jogos.reduce((sum, game) => sum + Number(game.custo), 0).toFixed(2),
          receitaPrevista: (pool.valorCota.toNumber() * pool.totalCotas).toFixed(2),
          taxaPrevista: (pool.valorCota.toNumber() * pool.totalCotas * pool.taxaAdministracaoPct.toNumber() / 100).toFixed(2),
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
      this.prisma.afiliado.findMany({ where, include: { usuario: { select: { id: true, nome: true, email: true, papel: true } }, comissoes: { select: { valor: true, status: true } }, _count: { select: { cotasReferenciadas: true } } }, orderBy: { criadoEm: 'desc' }, skip, take }),
      this.prisma.afiliado.count({ where }),
    ]);
    return { items: items.map((affiliate) => ({ ...affiliate, comissaoPadraoPct: affiliate.comissaoPadraoPct.toFixed(2), comissoes: undefined, indicadores: { cotas: affiliate._count.cotasReferenciadas, pendente: affiliate.comissoes.filter((row) => row.status === StatusComissao.pendente).reduce((sum, row) => sum + Number(row.valor), 0).toFixed(2), paga: affiliate.comissoes.filter((row) => row.status === StatusComissao.paga).reduce((sum, row) => sum + Number(row.valor), 0).toFixed(2) } })), pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
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

  async listUsers(query: AdminListQueryDto = {}) {
    const { page, pageSize, skip, take } = this.pagination(query);
    const where: Prisma.UsuarioWhereInput = query.busca ? { OR: [{ nome: { contains: query.busca, mode: 'insensitive' } }, { email: { contains: query.busca, mode: 'insensitive' } }, { cpf: { contains: query.busca } }] } : {};
    const [items, total] = await Promise.all([
      this.prisma.usuario.findMany({ where, select: { id: true, nome: true, cpf: true, email: true, telefone: true, papel: true, statusKyc: true, criadoEm: true, _count: { select: { cotasCompradas: true, auditorias: true } } }, orderBy: { criadoEm: 'desc' }, skip, take }),
      this.prisma.usuario.count({ where }),
    ]);
    return { items, pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) } };
  }

  async updateUserRole(id: string, dto: UpdateUserRoleDto, user: AuthUser) {
    if (id === user.id && dto.papel !== 'admin') throw new ConflictException('O administrador não pode remover o próprio acesso.');
    const target = await this.prisma.usuario.findUnique({ where: { id } });
    if (!target) throw new NotFoundException('Usuário não encontrado.');
    const updated = await this.prisma.$transaction(async (tx) => {
      const result = await tx.usuario.update({ where: { id }, data: { papel: dto.papel } });
      await this.audit.record(tx, { entidade: 'usuario', entidadeId: id, evento: 'usuario.papel.alterado', atorId: user.id, payloadAntes: target as unknown as Prisma.InputJsonValue, payloadDepois: result as unknown as Prisma.InputJsonValue });
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
