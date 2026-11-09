import { BadRequestException, Body, Controller, Get, NotFoundException, Put, Post, Query, UseGuards } from '@nestjs/common';
import { randomBytes } from 'crypto';
import { IsEmail, IsInt, IsNumber, IsOptional, IsString, Length, Max, Min } from 'class-validator';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.utils';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { addEntry, CASHBACK_PCT_KEY, KIND_LABELS, lockWallet, MAX_CASHBACK_PCT, parseCashbackPct, WALLET_KINDS, walletBalance } from './wallet';

const CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
export function makeReferralCode(bytes: Buffer = randomBytes(8)): string {
  return Array.from(bytes).map((byte) => CODE_ALPHABET[byte % CODE_ALPHABET.length]).join('');
}

export class CashbackConfigDto {
  @IsNumber() @Min(0) @Max(MAX_CASHBACK_PCT) percentual!: number;
}

export class WalletAdjustDto {
  @IsOptional() @IsEmail() email?: string;
  /** Positivo credita, negativo desconta. Em centavos. */
  @IsInt() @Min(-1_000_000) @Max(1_000_000) valorCentavos!: number;
  @IsString() @Length(5, 160) motivo!: string;
  /** "reembolso" = devolução em crédito; "bonus" = crédito promocional/ajuste. */
  @IsOptional() @IsString() tipo?: 'reembolso' | 'bonus';
}

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? '';

/** Carteira (crédito BL) e indicação de amigos, da própria conta. */
@Controller('usuarios/me')
@UseGuards(JwtAuthGuard)
export class WalletController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('carteira')
  async wallet(@CurrentUser() user: AuthUser) {
    const [balance, moves, setting, totals] = await Promise.all([
      walletBalance(this.prisma, user.id),
      this.prisma.carteiraMovimento.findMany({ where: { usuarioId: user.id }, orderBy: { criadoEm: 'desc' }, take: 60, select: { id: true, tipo: true, valorCentavos: true, descricao: true, criadoEm: true } }),
      this.prisma.configuracaoSistema.findUnique({ where: { chave: CASHBACK_PCT_KEY }, select: { valor: true } }),
      this.prisma.carteiraMovimento.groupBy({ by: ['tipo'], where: { usuarioId: user.id }, _sum: { valorCentavos: true } }),
    ]);
    const sum = (kind: string) => totals.find((row) => row.tipo === kind)?._sum.valorCentavos ?? 0;
    return {
      saldoCentavos: balance,
      saldo: balance / 100,
      cashbackPct: parseCashbackPct(setting?.valor),
      totalCashbackCentavos: sum(WALLET_KINDS.cashback) + sum(WALLET_KINDS.cashbackReversal),
      totalUsadoCentavos: -(sum(WALLET_KINDS.purchase) + sum(WALLET_KINDS.purchaseRefund)),
      movimentos: moves.map((move) => ({ id: move.id, tipo: move.tipo, nome: KIND_LABELS[move.tipo] ?? 'Movimento', valorCentavos: move.valorCentavos, descricao: move.descricao, em: move.criadoEm })),
    };
  }

  /** Link de indicação do cliente. O código é criado na primeira consulta. */
  @Get('indicacao')
  async referral(@CurrentUser() user: AuthUser) {
    let row = await this.prisma.usuario.findUnique({ where: { id: user.id }, select: { codigoIndicacao: true } });
    if (!row) throw new NotFoundException('Conta não encontrada.');
    for (let attempt = 0; attempt < 5 && !row.codigoIndicacao; attempt += 1) {
      const code = makeReferralCode();
      try { row = await this.prisma.usuario.update({ where: { id: user.id }, data: { codigoIndicacao: code }, select: { codigoIndicacao: true } }); }
      catch { row = await this.prisma.usuario.findUnique({ where: { id: user.id }, select: { codigoIndicacao: true } }) ?? row; }
    }
    if (!row.codigoIndicacao) throw new BadRequestException('Não foi possível criar o seu link agora. Tente novamente.');
    const [indicados, setting, cashback] = await Promise.all([
      this.prisma.usuario.findMany({ where: { indicadoPorUsuarioId: user.id }, orderBy: { criadoEm: 'desc' }, take: 100, select: { id: true, nome: true, criadoEm: true, cotasCompradas: { where: { status: { in: ['paga', 'registrada', 'apurada', 'premiada'] } }, select: { id: true }, take: 1 } } }),
      this.prisma.configuracaoSistema.findUnique({ where: { chave: CASHBACK_PCT_KEY }, select: { valor: true } }),
      this.prisma.carteiraMovimento.aggregate({ where: { usuarioId: user.id, tipo: { in: [WALLET_KINDS.cashback, WALLET_KINDS.cashbackReversal] } }, _sum: { valorCentavos: true } }),
    ]);
    return {
      codigo: row.codigoIndicacao,
      caminho: `/r/${row.codigoIndicacao}`,
      cashbackPct: parseCashbackPct(setting?.valor),
      cashbackTotalCentavos: cashback._sum.valorCentavos ?? 0,
      indicados: indicados.map((item) => ({ id: item.id, nome: firstName(item.nome), desde: item.criadoEm, comprou: item.cotasCompradas.length > 0 })),
      totalIndicados: indicados.length,
      totalCompraram: indicados.filter((item) => item.cotasCompradas.length > 0).length,
    };
  }
}

/** Administração da carteira: percentual de cashback, ajustes/reembolsos em crédito e visão geral. */
@Controller('admin/carteira')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class WalletAdminController {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  @Get()
  async overview(@Query('email') email?: string) {
    const [setting, totals, recent] = await Promise.all([
      this.prisma.configuracaoSistema.findUnique({ where: { chave: CASHBACK_PCT_KEY }, select: { valor: true } }),
      this.prisma.carteiraMovimento.groupBy({ by: ['tipo'], _sum: { valorCentavos: true }, _count: { _all: true } }),
      this.prisma.carteiraMovimento.findMany({ where: email ? { usuario: { email: email.toLowerCase().trim() } } : {}, orderBy: { criadoEm: 'desc' }, take: 50, select: { id: true, tipo: true, valorCentavos: true, descricao: true, criadoEm: true, usuario: { select: { nome: true, email: true } } } }),
    ]);
    const all = totals.reduce((sum, row) => sum + (row._sum.valorCentavos ?? 0), 0);
    return {
      cashbackPct: parseCashbackPct(setting?.valor),
      saldoEmAbertoCentavos: all,
      porTipo: totals.map((row) => ({ tipo: row.tipo, nome: KIND_LABELS[row.tipo] ?? row.tipo, movimentos: row._count._all, totalCentavos: row._sum.valorCentavos ?? 0 })),
      recentes: recent.map((move) => ({ id: move.id, nome: KIND_LABELS[move.tipo] ?? move.tipo, valorCentavos: move.valorCentavos, descricao: move.descricao, em: move.criadoEm, cliente: move.usuario.nome, email: move.usuario.email })),
    };
  }

  @Put('cashback')
  async setCashback(@Body() dto: CashbackConfigDto, @CurrentUser() admin: AuthUser) {
    const value = String(parseCashbackPct(String(dto.percentual)));
    await this.prisma.configuracaoSistema.upsert({ where: { chave: CASHBACK_PCT_KEY }, create: { chave: CASHBACK_PCT_KEY, valor: value }, update: { valor: value } });
    await this.audit.record(this.prisma, { entidade: 'configuracao', entidadeId: admin.id, evento: 'carteira.cashback_alterado', atorId: admin.id, payloadDepois: { percentual: Number(value) } });
    return { cashbackPct: Number(value) };
  }

  @Post('ajuste')
  async adjust(@Body() dto: WalletAdjustDto, @CurrentUser() admin: AuthUser) {
    if (!dto.valorCentavos) throw new BadRequestException('Informe um valor diferente de zero.');
    if (!dto.email) throw new BadRequestException('Informe o e-mail do cliente.');
    const target = await this.prisma.usuario.findUnique({ where: { email: dto.email.toLowerCase().trim() }, select: { id: true, nome: true, desativadoEm: true } });
    if (!target || target.desativadoEm) throw new NotFoundException('Cliente não encontrado.');
    const credit = dto.valorCentavos > 0;
    const kind = credit ? (dto.tipo === 'reembolso' ? WALLET_KINDS.refundCredit : WALLET_KINDS.adminCredit) : WALLET_KINDS.adminDebit;
    const balance = await this.prisma.$transaction(async (tx) => {
      await lockWallet(tx, target.id);
      const current = await walletBalance(tx, target.id);
      if (!credit && current + dto.valorCentavos < 0) throw new BadRequestException('O desconto é maior que o saldo do cliente.');
      await addEntry(tx, { usuarioId: target.id, tipo: kind, valorCentavos: dto.valorCentavos, descricao: dto.motivo.trim(), criadoPor: admin.id });
      await this.audit.record(tx, { entidade: 'usuario', entidadeId: target.id, evento: 'carteira.ajuste', atorId: admin.id, payloadDepois: { valorCentavos: dto.valorCentavos, tipo: kind, motivo: dto.motivo.trim() } });
      if (credit) await tx.notificacao.create({ data: { usuarioId: target.id, canal: 'push', tipo: 'carteira.credito', payload: { titulo: 'Crédito na sua carteira', mensagem: `${(dto.valorCentavos / 100).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} foram adicionados à sua carteira. Use para pagar suas cotas.`, link: '/minha-conta?aba=carteira' } } });
      return current + dto.valorCentavos;
    });
    return { cliente: target.nome, saldoCentavos: balance };
  }
}
