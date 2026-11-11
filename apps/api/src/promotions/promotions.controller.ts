import { BadRequestException, Body, ConflictException, Controller, Delete, Get, NotFoundException, Param, ParseUUIDPipe, Post, Put, Query, UseGuards } from '@nestjs/common';
import { Prisma, StatusCota } from '@prisma/client';
import { randomBytes } from 'node:crypto';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.utils';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { amountsForPool } from '../payments/payments.service';
import { campaignSpentCents } from './cashback';
import { checkCoupon, holdsCouponUse, resolveCoupon, userGroupIds } from './coupons';
import { CreateCampaignDto, CreateCouponDto, UpdateCouponDto, CampaignBaseDto } from './promotions.dto';
import { describeCoupon, inAudience, inPeriod, normalizeCouponCode, toCents } from './promo-math';

const PAID: StatusCota[] = [StatusCota.paga, StatusCota.registrada, StatusCota.apurada, StatusCota.premiada];
const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const randomCode = () => Array.from(randomBytes(8)).map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
const reaisToCents = (value: number | null | undefined) => (value === null || value === undefined ? null : toCents(value));
const dateOrNull = (value: string | null | undefined) => (value ? new Date(value) : null);

type Audience = { grupoIds?: string[]; usuarioIds?: string[] };

/** Confere que os grupos e clientes escolhidos existem e que há pelo menos um: cupom e cashback nunca valem para todos. */
async function checkAudience(prisma: PrismaService, audience: { grupoIds: string[]; usuarioIds: string[] }) {
  const grupoIds = [...new Set(audience.grupoIds)]; const usuarioIds = [...new Set(audience.usuarioIds)];
  if (!grupoIds.length && !usuarioIds.length) throw new BadRequestException('Escolha pelo menos um grupo ou um cliente. Cupom e cashback não valem para todos.');
  if (grupoIds.length && await prisma.grupo.count({ where: { id: { in: grupoIds } } }) !== grupoIds.length) throw new BadRequestException('Um dos grupos escolhidos não existe mais.');
  if (usuarioIds.length && await prisma.usuario.count({ where: { id: { in: usuarioIds }, desativadoEm: null } }) !== usuarioIds.length) throw new BadRequestException('Um dos clientes escolhidos não existe ou está desativado.');
  return { grupoIds, usuarioIds };
}

function checkPeriod(inicioEm: Date | null, fimEm: Date | null, requireFuture: boolean) {
  if (inicioEm && Number.isNaN(inicioEm.getTime())) throw new BadRequestException('Data de início inválida.');
  if (fimEm && Number.isNaN(fimEm.getTime())) throw new BadRequestException('Data de fim inválida.');
  if (inicioEm && fimEm && fimEm <= inicioEm) throw new BadRequestException('O fim precisa ser depois do início.');
  if (requireFuture && fimEm && fimEm <= new Date()) throw new BadRequestException('A data de fim já passou.');
}

async function nameAudience(prisma: PrismaService, rows: Array<{ grupoIds: string[]; usuarioIds: string[] }>) {
  const groupIds = [...new Set(rows.flatMap((row) => row.grupoIds))]; const userIds = [...new Set(rows.flatMap((row) => row.usuarioIds))];
  const [groups, users] = await Promise.all([
    groupIds.length ? prisma.grupo.findMany({ where: { id: { in: groupIds } }, select: { id: true, nome: true } }) : [],
    userIds.length ? prisma.usuario.findMany({ where: { id: { in: userIds } }, select: { id: true, nome: true, email: true } }) : [],
  ]);
  return { groups: new Map(groups.map((item) => [item.id, item])), users: new Map(users.map((item) => [item.id, item])) };
}

/** Cupons de desconto: só o administrador cria e gerencia. */
@Controller('admin/cupons')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class CouponsAdminController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  async list() {
    const now = new Date();
    const coupons = await this.prisma.cupom.findMany({ orderBy: { criadoEm: 'desc' }, take: 300, include: { criador: { select: { nome: true } } } });
    const ids = coupons.map((coupon) => coupon.id);
    const [live, paid, names] = await Promise.all([
      ids.length ? this.prisma.cupomUso.groupBy({ by: ['cupomId'], where: { cupomId: { in: ids }, cota: holdsCouponUse(now) }, _count: { _all: true } }) : [],
      ids.length ? this.prisma.cupomUso.groupBy({ by: ['cupomId'], where: { cupomId: { in: ids }, cota: { status: { in: PAID } } }, _count: { _all: true }, _sum: { descontoCentavos: true } }) : [],
      nameAudience(this.prisma, coupons),
    ]);
    return {
      items: coupons.map((coupon) => {
        const used = live.find((row) => row.cupomId === coupon.id)?._count._all ?? 0;
        const settled = paid.find((row) => row.cupomId === coupon.id);
        const state = !coupon.ativo ? 'pausado' : coupon.fimEm && coupon.fimEm < now ? 'vencido' : coupon.inicioEm && coupon.inicioEm > now ? 'agendado' : coupon.limiteTotal !== null && used >= coupon.limiteTotal ? 'esgotado' : 'ativo';
        return {
          id: coupon.id, codigo: coupon.codigo, descricao: coupon.descricao, tipo: coupon.tipo, valor: Number(coupon.valor), resumo: describeCoupon({ tipo: coupon.tipo as 'percentual' | 'valor', valor: Number(coupon.valor) }),
          descontoMaximoCentavos: coupon.descontoMaximoCentavos, valorMinimoCentavos: coupon.valorMinimoCentavos, automatico: coupon.automatico, ativo: coupon.ativo, estado: state,
          inicioEm: coupon.inicioEm, fimEm: coupon.fimEm, limiteTotal: coupon.limiteTotal, limitePorCliente: coupon.limitePorCliente,
          grupos: coupon.grupoIds.map((id) => names.groups.get(id) ?? { id, nome: 'Grupo removido' }), clientes: coupon.usuarioIds.map((id) => names.users.get(id) ?? { id, nome: 'Cliente removido', email: '' }),
          usosEmAberto: used, usosPagos: settled?._count._all ?? 0, descontoTotalCentavos: settled?._sum.descontoCentavos ?? 0, criadoPor: coupon.criador.nome, criadoEm: coupon.criadoEm,
        };
      }),
    };
  }

  @Post()
  async create(@Body() dto: CreateCouponDto, @CurrentUser() admin: AuthUser) {
    if (dto.tipo === 'percentual' && dto.valor > 100) throw new BadRequestException('O desconto em porcentagem vai de 0,01% a 100%.');
    const audience = await checkAudience(this.prisma, { grupoIds: dto.grupoIds ?? [], usuarioIds: dto.usuarioIds ?? [] });
    const inicioEm = dateOrNull(dto.inicioEm); const fimEm = dateOrNull(dto.fimEm);
    checkPeriod(inicioEm, fimEm, true);
    const codigo = dto.codigo ? normalizeCouponCode(dto.codigo) : randomCode();
    if (codigo.length < 3) throw new BadRequestException('O código precisa ter pelo menos 3 letras ou números.');
    if (await this.prisma.cupom.findUnique({ where: { codigo }, select: { id: true } })) throw new ConflictException('Já existe um cupom com este código.');
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.cupom.create({
        data: {
          codigo, descricao: dto.descricao?.trim() || null, tipo: dto.tipo, valor: new Prisma.Decimal(dto.valor), descontoMaximoCentavos: reaisToCents(dto.descontoMaximoReais), valorMinimoCentavos: reaisToCents(dto.valorMinimoReais),
          automatico: dto.automatico === true, inicioEm, fimEm, limiteTotal: dto.limiteTotal ?? null, limitePorCliente: dto.limitePorCliente === undefined ? 1 : dto.limitePorCliente,
          grupoIds: audience.grupoIds, usuarioIds: audience.usuarioIds, criadoPor: admin.id,
        },
      });
      await this.audit.record(tx, { entidade: 'cupom', entidadeId: row.id, evento: 'cupom.criado', atorId: admin.id, payloadDepois: { codigo, tipo: dto.tipo, valor: dto.valor, grupos: audience.grupoIds.length, clientes: audience.usuarioIds.length } });
      return row;
    });
    return { id: created.id, codigo: created.codigo };
  }

  @Put(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: UpdateCouponDto, @CurrentUser() admin: AuthUser) {
    const current = await this.prisma.cupom.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Cupom não encontrado.');
    const data: Prisma.CupomUpdateInput = {};
    if (dto.descricao !== undefined) data.descricao = dto.descricao.trim() || null;
    if (dto.descontoMaximoReais !== undefined) data.descontoMaximoCentavos = reaisToCents(dto.descontoMaximoReais);
    if (dto.valorMinimoReais !== undefined) data.valorMinimoCentavos = reaisToCents(dto.valorMinimoReais);
    if (dto.automatico !== undefined) data.automatico = dto.automatico;
    if (dto.ativo !== undefined) data.ativo = dto.ativo;
    const inicioEm = dto.inicioEm !== undefined ? dateOrNull(dto.inicioEm) : current.inicioEm; const fimEm = dto.fimEm !== undefined ? dateOrNull(dto.fimEm) : current.fimEm;
    if (dto.inicioEm !== undefined || dto.fimEm !== undefined) { checkPeriod(inicioEm, fimEm, dto.fimEm !== undefined); data.inicioEm = inicioEm; data.fimEm = fimEm; }
    if (dto.limiteTotal !== undefined) {
      if (dto.limiteTotal !== null) {
        const used = await this.prisma.cupomUso.count({ where: { cupomId: id, cota: holdsCouponUse(new Date()) } });
        if (dto.limiteTotal < used) throw new BadRequestException(`O limite não pode ser menor que os ${used} usos que já existem.`);
      }
      data.limiteTotal = dto.limiteTotal;
    }
    if (dto.limitePorCliente !== undefined) data.limitePorCliente = dto.limitePorCliente;
    if (dto.grupoIds !== undefined || dto.usuarioIds !== undefined) {
      const audience = await checkAudience(this.prisma, { grupoIds: dto.grupoIds ?? current.grupoIds, usuarioIds: dto.usuarioIds ?? current.usuarioIds });
      data.grupoIds = audience.grupoIds; data.usuarioIds = audience.usuarioIds;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.cupom.update({ where: { id }, data });
      await this.audit.record(tx, { entidade: 'cupom', entidadeId: id, evento: 'cupom.alterado', atorId: admin.id, payloadDepois: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue });
    });
    return { ok: true };
  }

  @Post(':id/pausar')
  async pause(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser) { return this.setActive(id, false, admin); }

  @Post(':id/ativar')
  async activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser) { return this.setActive(id, true, admin); }

  private async setActive(id: string, ativo: boolean, admin: AuthUser) {
    const current = await this.prisma.cupom.findUnique({ where: { id }, select: { id: true } });
    if (!current) throw new NotFoundException('Cupom não encontrado.');
    await this.prisma.$transaction(async (tx) => {
      await tx.cupom.update({ where: { id }, data: { ativo } });
      await this.audit.record(tx, { entidade: 'cupom', entidadeId: id, evento: ativo ? 'cupom.ativado' : 'cupom.pausado', atorId: admin.id });
    });
    return { ok: true, ativo };
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser) {
    const current = await this.prisma.cupom.findUnique({ where: { id }, select: { id: true, codigo: true } });
    if (!current) throw new NotFoundException('Cupom não encontrado.');
    if (await this.prisma.cupomUso.count({ where: { cupomId: id } })) throw new ConflictException('Este cupom já foi usado e o histórico precisa ficar guardado. Pause o cupom em vez de apagar.');
    await this.prisma.$transaction(async (tx) => {
      await tx.cupom.delete({ where: { id } });
      await this.audit.record(tx, { entidade: 'cupom', entidadeId: id, evento: 'cupom.apagado', atorId: admin.id, payloadAntes: { codigo: current.codigo } });
    });
    return { ok: true };
  }

  @Get(':id/usos')
  async uses(@Param('id', ParseUUIDPipe) id: string) {
    const rows = await this.prisma.cupomUso.findMany({ where: { cupomId: id }, orderBy: { criadoEm: 'desc' }, take: 300, include: { usuario: { select: { nome: true, email: true } }, cota: { select: { status: true, quantidade: true, bolao: { select: { concurso: { select: { modalidade: true, numeroConcurso: true } } } } } } } });
    return { items: rows.map((row) => ({ id: row.id, cliente: row.usuario.nome, email: row.usuario.email, descontoCentavos: row.descontoCentavos, situacao: PAID.includes(row.cota.status) ? 'pago' : row.cota.status === StatusCota.reservada ? 'aguardando pagamento' : 'cancelado', cotas: row.cota.quantidade, bolao: `${row.cota.bolao.concurso.modalidade} #${row.cota.bolao.concurso.numeroConcurso}`, em: row.criadoEm })) };
  }
}

/** Campanhas de cashback: ativadas pelo administrador para grupos e clientes escolhidos. */
@Controller('admin/cashback-campanhas')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class CashbackCampaignsAdminController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  async list() {
    const now = new Date();
    const campaigns = await this.prisma.cashbackCampanha.findMany({ orderBy: { criadoEm: 'desc' }, take: 300, include: { criador: { select: { nome: true } } } });
    const names = await nameAudience(this.prisma, campaigns);
    const items = await Promise.all(campaigns.map(async (campaign) => {
      const spent = await campaignSpentCents(this.prisma, campaign.id);
      const credits = await this.prisma.carteiraMovimento.count({ where: { chave: { startsWith: `camp:${campaign.id}:` } } });
      const state = !campaign.ativa ? 'pausada' : campaign.fimEm && campaign.fimEm < now ? 'vencida' : campaign.inicioEm && campaign.inicioEm > now ? 'agendada' : campaign.orcamentoCentavos !== null && spent >= campaign.orcamentoCentavos ? 'esgotada' : 'ativa';
      return {
        id: campaign.id, nome: campaign.nome, percentual: Number(campaign.percentual), valorMinimoCentavos: campaign.valorMinimoCentavos, maximoPorCompraCentavos: campaign.maximoPorCompraCentavos, orcamentoCentavos: campaign.orcamentoCentavos,
        ativa: campaign.ativa, estado: state, inicioEm: campaign.inicioEm, fimEm: campaign.fimEm,
        grupos: campaign.grupoIds.map((id) => names.groups.get(id) ?? { id, nome: 'Grupo removido' }), clientes: campaign.usuarioIds.map((id) => names.users.get(id) ?? { id, nome: 'Cliente removido', email: '' }),
        creditadoCentavos: spent, compras: credits, restanteCentavos: campaign.orcamentoCentavos === null ? null : Math.max(0, campaign.orcamentoCentavos - spent), criadoPor: campaign.criador.nome, criadoEm: campaign.criadoEm,
      };
    }));
    return { items };
  }

  @Post()
  async create(@Body() dto: CreateCampaignDto, @CurrentUser() admin: AuthUser) {
    const audience = await checkAudience(this.prisma, { grupoIds: dto.grupoIds ?? [], usuarioIds: dto.usuarioIds ?? [] });
    const inicioEm = dateOrNull(dto.inicioEm); const fimEm = dateOrNull(dto.fimEm);
    checkPeriod(inicioEm, fimEm, true);
    const created = await this.prisma.$transaction(async (tx) => {
      const row = await tx.cashbackCampanha.create({
        data: { nome: dto.nome.trim(), percentual: new Prisma.Decimal(dto.percentual), valorMinimoCentavos: reaisToCents(dto.valorMinimoReais), maximoPorCompraCentavos: reaisToCents(dto.maximoPorCompraReais), orcamentoCentavos: reaisToCents(dto.orcamentoReais), ativa: dto.ativa === true, inicioEm, fimEm, grupoIds: audience.grupoIds, usuarioIds: audience.usuarioIds, criadoPor: admin.id },
      });
      await this.audit.record(tx, { entidade: 'cashback_campanha', entidadeId: row.id, evento: 'cashback.campanha_criada', atorId: admin.id, payloadDepois: { nome: row.nome, percentual: dto.percentual, ativa: row.ativa, grupos: audience.grupoIds.length, clientes: audience.usuarioIds.length } });
      return row;
    });
    return { id: created.id };
  }

  @Put(':id')
  async update(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CampaignBaseDto, @CurrentUser() admin: AuthUser) {
    const current = await this.prisma.cashbackCampanha.findUnique({ where: { id } });
    if (!current) throw new NotFoundException('Campanha não encontrada.');
    const data: Prisma.CashbackCampanhaUpdateInput = {};
    if (dto.nome !== undefined) data.nome = dto.nome.trim();
    if (dto.percentual !== undefined) data.percentual = new Prisma.Decimal(dto.percentual);
    if (dto.valorMinimoReais !== undefined) data.valorMinimoCentavos = reaisToCents(dto.valorMinimoReais);
    if (dto.maximoPorCompraReais !== undefined) data.maximoPorCompraCentavos = reaisToCents(dto.maximoPorCompraReais);
    if (dto.orcamentoReais !== undefined) {
      const spent = await campaignSpentCents(this.prisma, id);
      if (dto.orcamentoReais !== null && toCents(dto.orcamentoReais) < spent) throw new BadRequestException(`O orçamento não pode ser menor que o que já foi dado de cashback (R$ ${(spent / 100).toFixed(2).replace('.', ',')}).`);
      data.orcamentoCentavos = reaisToCents(dto.orcamentoReais);
    }
    if (dto.ativa !== undefined) data.ativa = dto.ativa;
    const inicioEm = dto.inicioEm !== undefined ? dateOrNull(dto.inicioEm) : current.inicioEm; const fimEm = dto.fimEm !== undefined ? dateOrNull(dto.fimEm) : current.fimEm;
    if (dto.inicioEm !== undefined || dto.fimEm !== undefined) { checkPeriod(inicioEm, fimEm, dto.fimEm !== undefined); data.inicioEm = inicioEm; data.fimEm = fimEm; }
    if (dto.grupoIds !== undefined || dto.usuarioIds !== undefined) {
      const audience = await checkAudience(this.prisma, { grupoIds: dto.grupoIds ?? current.grupoIds, usuarioIds: dto.usuarioIds ?? current.usuarioIds });
      data.grupoIds = audience.grupoIds; data.usuarioIds = audience.usuarioIds;
    }
    await this.prisma.$transaction(async (tx) => {
      await tx.cashbackCampanha.update({ where: { id }, data });
      await this.audit.record(tx, { entidade: 'cashback_campanha', entidadeId: id, evento: 'cashback.campanha_alterada', atorId: admin.id, payloadDepois: JSON.parse(JSON.stringify(dto)) as Prisma.InputJsonValue });
    });
    return { ok: true };
  }

  @Post(':id/ativar')
  async activate(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser) { return this.setActive(id, true, admin); }

  @Post(':id/pausar')
  async pause(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser) { return this.setActive(id, false, admin); }

  private async setActive(id: string, ativa: boolean, admin: AuthUser) {
    const current = await this.prisma.cashbackCampanha.findUnique({ where: { id }, select: { id: true, fimEm: true } });
    if (!current) throw new NotFoundException('Campanha não encontrada.');
    if (ativa && current.fimEm && current.fimEm <= new Date()) throw new BadRequestException('O período desta campanha já acabou. Edite a data de fim para ativar de novo.');
    await this.prisma.$transaction(async (tx) => {
      await tx.cashbackCampanha.update({ where: { id }, data: { ativa } });
      await this.audit.record(tx, { entidade: 'cashback_campanha', entidadeId: id, evento: ativa ? 'cashback.campanha_ativada' : 'cashback.campanha_pausada', atorId: admin.id });
    });
    return { ok: true, ativa };
  }

  @Delete(':id')
  async remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() admin: AuthUser) {
    const current = await this.prisma.cashbackCampanha.findUnique({ where: { id }, select: { id: true, nome: true } });
    if (!current) throw new NotFoundException('Campanha não encontrada.');
    if (await this.prisma.carteiraMovimento.count({ where: { chave: { startsWith: `camp:${id}:` } } })) throw new ConflictException('Esta campanha já deu cashback e o histórico precisa ficar guardado. Pause a campanha em vez de apagar.');
    await this.prisma.$transaction(async (tx) => {
      await tx.cashbackCampanha.delete({ where: { id } });
      await this.audit.record(tx, { entidade: 'cashback_campanha', entidadeId: id, evento: 'cashback.campanha_apagada', atorId: admin.id, payloadAntes: { nome: current.nome } });
    });
    return { ok: true };
  }
}

/** Listas para escolher quem recebe: grupos e clientes. Só administrador. */
@Controller('admin/promocoes')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class PromotionsPickerController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('grupos')
  async groups() {
    const rows = await this.prisma.grupo.findMany({ orderBy: { nome: 'asc' }, take: 500, select: { id: true, nome: true, tipo: true, _count: { select: { membros: true } } } });
    return { items: rows.map((row) => ({ id: row.id, nome: row.nome, tipo: row.tipo, membros: row._count.membros })) };
  }

  @Get('clientes')
  async clients(@Query('busca') search?: string) {
    const term = (search ?? '').trim();
    if (term.length < 2) return { items: [] };
    const rows = await this.prisma.usuario.findMany({ where: { desativadoEm: null, OR: [{ nome: { contains: term, mode: 'insensitive' } }, { email: { contains: term, mode: 'insensitive' } }] }, orderBy: { nome: 'asc' }, take: 15, select: { id: true, nome: true, email: true, papel: true } });
    return { items: rows };
  }
}

/** O cliente vê o desconto antes de pagar. Mostra só o cupom dele (ou o automático) e o cashback ativo, sem expor os outros. */
@Controller('cupons')
@UseGuards(JwtAuthGuard)
export class CouponsClientController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('aplicavel')
  async applicable(@CurrentUser() user: AuthUser, @Query('bolaoId', ParseUUIDPipe) bolaoId: string, @Query('quantidade') quantity?: string, @Query('codigo') code?: string) {
    const qty = Math.max(1, Math.min(1000, Math.trunc(Number(quantity) || 1)));
    const pool = await this.prisma.bolao.findUnique({ where: { id: bolaoId }, select: { valorCota: true, taxaAdministracaoPct: true, precificacao: true } });
    if (!pool) throw new NotFoundException('Bolão não encontrado.');
    const base = amountsForPool(pool, qty, 0);
    const grossCents = toCents(base.gross);
    const now = new Date();
    const groups = await userGroupIds(this.prisma, user.id);
    // Cashback ativo para esta pessoa (só o percentual: o valor final depende da taxa na hora do pagamento).
    const campaigns = await this.prisma.cashbackCampanha.findMany({ where: { ativa: true, OR: [{ usuarioIds: { has: user.id } }, ...(groups.length ? [{ grupoIds: { hasSome: groups } }] : [])] }, take: 20 });
    const cashback = campaigns.filter((campaign) => inPeriod(campaign, now) && inAudience({ grupoIds: campaign.grupoIds, usuarioIds: campaign.usuarioIds }, user.id, groups)).sort((a, b) => Number(b.percentual) - Number(a.percentual))[0];
    const cashbackInfo = cashback ? { nome: cashback.nome, percentual: Number(cashback.percentual) } : null;
    try {
      const coupon = await resolveCoupon(this.prisma, { userId: user.id, code, grossCents, feeCents: toCents(base.adminFee), lock: false });
      if (!coupon) return { aplicado: false, totalCentavos: grossCents, totalComDescontoCentavos: grossCents, cashback: cashbackInfo };
      return { aplicado: true, codigo: coupon.codigo, descricao: coupon.descricao, automatico: coupon.automatico, descontoCentavos: coupon.descontoCentavos, totalCentavos: grossCents, totalComDescontoCentavos: grossCents - coupon.descontoCentavos, cashback: cashbackInfo };
    } catch (error) {
      if (code?.trim() && error instanceof ConflictException) return { aplicado: false, erro: error.message, totalCentavos: grossCents, totalComDescontoCentavos: grossCents, cashback: cashbackInfo };
      return { aplicado: false, totalCentavos: grossCents, totalComDescontoCentavos: grossCents, cashback: cashbackInfo };
    }
  }
}
