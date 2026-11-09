import { approvedDocument } from '../legal/documents';
import { hasSaleProof } from '../attachments/proof';
import { BadRequestException, ConflictException, ForbiddenException, Inject, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { MetodoPagamento, Prisma, StatusBolao, StatusComissao, StatusCota, StatusPagamento } from '@prisma/client';
import { AuthUser } from '../auth/auth.utils';
import { addDaysToDate, brazilDate, endOfBrazilDay, round2 } from '../common/brazil-time';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { addEntry, grantReferralCashback, lockWallet, unwindWalletForPayment, walletBalance, WALLET_KINDS } from '../wallet/wallet';
import { CancelShareDto, CreatePaymentDto, ManualPaymentDto, ManualSaleDto } from './payments.dto';
import { buildCardProvider, buildPaymentProvider, ChargeMethod, ChargeStatus, CoraProvider, PaymentProvider } from './payment.provider';

export const PAYMENT_PROVIDER_OVERRIDE = 'PAYMENT_PROVIDER_OVERRIDE';

type Tx = Prisma.TransactionClient;
type PaymentRow = Prisma.PagamentoGetPayload<Record<string, never>>;

export interface ShareAmounts { gross: number; cost: number; adminFee: number; affiliateCommission: number }

/** Decomposição financeira de uma cota. Sempre fecha: gross = cost + adminFee. */
export function computeShareAmounts(valorCota: number, quantidade: number, taxaAdminPct: number, comissaoAfiliadoPct: number): ShareAmounts {
  if (![valorCota, quantidade, taxaAdminPct, comissaoAfiliadoPct].every(Number.isFinite) || valorCota <= 0 || !Number.isSafeInteger(quantidade) || quantidade < 1 || taxaAdminPct < 0 || taxaAdminPct > 35 || comissaoAfiliadoPct < 0 || comissaoAfiliadoPct > 100) throw new BadRequestException('Valores financeiros inválidos.');
  const gross = round2(valorCota * quantidade);
  const cost = round2(gross / (1 + taxaAdminPct / 100));
  const adminFee = round2(gross - cost);
  const affiliateCommission = round2(adminFee * (comissaoAfiliadoPct / 100));
  return { gross, cost, adminFee, affiliateCommission };
}

@Injectable()
export class PaymentsService {
  private readonly logger = new Logger(PaymentsService.name);
  /** Provedor principal (Pix e boleto). */
  private readonly provider: PaymentProvider;
  /** Todos os provedores ativos, por nome: o principal e, se houver, o do cartão. */
  private readonly providers = new Map<string, PaymentProvider>();
  private readonly enabled: boolean;
  private readonly reservationMinutes: number;
  private readonly boletoDueDays: number;
  private readonly boletoMinHoursToCutoff: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    @Optional() @Inject(PAYMENT_PROVIDER_OVERRIDE) provider?: PaymentProvider,
  ) {
    this.enabled = config.get<string>('PAYMENTS_ENABLED', 'false') === 'true';
    this.provider = provider ?? buildPaymentProvider(config);
    this.providers.set(this.provider.name, this.provider);
    const card = provider ? null : buildCardProvider(config);
    if (card) this.providers.set(card.name, card);
    this.reservationMinutes = Number(config.get<string>('SHARE_RESERVATION_MINUTES', '15')) || 15;
    this.boletoDueDays = Number(config.get<string>('PAYMENT_BOLETO_DUE_DAYS', '2')) || 2;
    this.boletoMinHoursToCutoff = Number(config.get<string>('PAYMENT_BOLETO_MIN_HOURS_TO_CUTOFF', '96')) || 96;
  }

  private shareAmounts(share: { quantidade: number; bolao: { valorCota: Prisma.Decimal; taxaAdministracaoPct: Prisma.Decimal; precificacao?: Prisma.JsonValue | null }; afiliadoReferencia?: { comissaoPadraoPct: Prisma.Decimal } | null }): ShareAmounts {
    const snapshot = share.bolao.precificacao as { ticketPerShare?: number; feePerShare?: number } | null;
    const affiliate = Number(share.afiliadoReferencia?.comissaoPadraoPct ?? 0);
    if (snapshot && Number.isSafeInteger(snapshot.ticketPerShare) && Number.isSafeInteger(snapshot.feePerShare)) {
      const cost = snapshot.ticketPerShare! * share.quantidade / 100;
      const adminFee = snapshot.feePerShare! * share.quantidade / 100;
      return { cost, adminFee, gross: round2(cost + adminFee), affiliateCommission: round2(adminFee * affiliate / 100) };
    }
    return computeShareAmounts(Number(share.bolao.valorCota), share.quantidade, Number(share.bolao.taxaAdministracaoPct), affiliate);
  }

  /** Provedor Cora ativo (usado pelo módulo fiscal para emitir NFS-e), ou null. */
  coraProvider(): CoraProvider | null {
    for (const candidate of this.providers.values()) if (candidate instanceof CoraProvider) return candidate;
    return null;
  }

  /** Métodos oferecidos ao cliente: os do provedor principal e os do cartão, sem repetir. */
  private allMethods(): ChargeMethod[] {
    return [...new Set([...this.providers.values()].flatMap((candidate) => candidate.methods))];
  }

  /** Quem cobra cada método: o principal quando o declara; senão o provedor do cartão. */
  private providerFor(method: ChargeMethod): PaymentProvider | undefined {
    return [...this.providers.values()].find((candidate) => candidate.methods.includes(method));
  }

  private providerByName(name?: string): PaymentProvider | undefined {
    return name ? this.providers.get(name) : this.provider;
  }

  /** Estado público da configuração de pagamentos (sem segredos). */
  settings() {
    const publicUrl = this.config.get<string>('PUBLIC_API_URL', '') || this.config.get<string>('WEB_ORIGIN', '');
    return {
      habilitado: this.enabled,
      provedor: this.provider.name,
      metodos: this.allMethods(),
      valorMinimo: this.provider.minAmount,
      valorMinimoPorMetodo: Object.fromEntries(this.allMethods().map((method) => [method, this.providerFor(method)!.minAmount])),
      provedores: [...this.providers.keys()],
      webhookCartaoUrl: this.cardProviderName() && publicUrl ? `${publicUrl.replace(/\/$/, '')}/api/v1/webhooks/pagamento/${this.cardProviderName()}` : null,
      boletoVencimentoDias: this.boletoDueDays,
      boletoAntecedenciaMinimaHoras: this.boletoMinHoursToCutoff,
      webhookUrl: publicUrl ? `${publicUrl.replace(/\/$/, '')}/api/v1/webhooks/pagamento/${this.provider.name}` : null,
      webhookTokenConfigurado: Boolean(this.config.get<string>('PAYMENT_WEBHOOK_SECRET', '')),
      ambienteCora: this.provider.name === 'cora' ? this.config.get<string>('CORA_ENV', 'stage') : null,
    };
  }

  private cardProviderName(): string | null {
    return [...this.providers.keys()].find((name) => name !== this.provider.name) ?? null;
  }

  /* ------------------------------------------------------------------ */
  /* Cobrança do participante                                            */
  /* ------------------------------------------------------------------ */

  async createForShare(shareId: string, dto: CreatePaymentDto, user: AuthUser) {
    if (!this.enabled) throw new ServiceUnavailableException('Os pagamentos estão temporariamente indisponíveis. Tente novamente em instantes.');
    const share = await this.prisma.cota.findUnique({ where: { id: shareId }, include: { bolao: { include: { concurso: true } }, comprador: true, afiliadoReferencia: true, pagamento: true } });
    if (!share) throw new NotFoundException('Cota não encontrada.');
    if (share.compradorId !== user.id) throw new ConflictException('A cota não pertence ao usuário autenticado.');
    if (share.status !== StatusCota.reservada || (share.expiraReservaEm && share.expiraReservaEm <= new Date())) throw new ConflictException('A reserva não está mais disponível para pagamento.');
    if (share.pagamento && (share.pagamento.status === StatusPagamento.pendente || share.pagamento.status === StatusPagamento.confirmado) && share.pagamento.pspTransactionId) {
      return this.toPublicPayment(share.pagamento);
    }
    const provider = this.providerFor(dto.metodo);
    if (!provider) throw new BadRequestException('Este método de pagamento não está disponível no momento.');

    const amounts = this.shareAmounts(share);
    if (amounts.gross < provider.minAmount) {
      throw new BadRequestException(`O valor mínimo para pagamento é R$ ${provider.minAmount.toFixed(2).replace('.', ',')}. Aumente a quantidade de cotas.`);
    }

    const now = new Date();
    let dueDate: string;
    let reservationUntil: Date | null = null;
    if (dto.metodo === 'boleto') {
      const cutoff = share.bolao.concurso?.cutoffAt;
      const hoursToCutoff = cutoff ? (cutoff.getTime() - now.getTime()) / 3_600_000 : Number.POSITIVE_INFINITY;
      if (hoursToCutoff < this.boletoMinHoursToCutoff) {
        throw new BadRequestException('O boleto leva até 3 dias úteis para compensar e não é mais possível para este bolão. Pague com Pix.');
      }
      dueDate = addDaysToDate(brazilDate(now), this.boletoDueDays);
      reservationUntil = endOfBrazilDay(dueDate);
    } else {
      dueDate = brazilDate(new Date(now.getTime() + this.reservationMinutes * 60_000));
    }

    const base = {
      metodo: dto.metodo as MetodoPagamento,
      valorBruto: new Prisma.Decimal(amounts.gross),
      valorTaxaAdmin: new Prisma.Decimal(amounts.adminFee),
      valorComissaoAfiliado: new Prisma.Decimal(amounts.affiliateCommission),
      valorCustoBilhete: new Prisma.Decimal(amounts.cost),
      status: StatusPagamento.pendente,
      pspProvedor: provider.name,
      origem: 'gateway',
      vencimentoEm: endOfBrazilDay(dueDate),
    };
    // An uncertain network result must reuse the same provider key, never create a new charge.
    if (share.pagamento && share.pagamento.metodo !== dto.metodo) throw new ConflictException('Concilie a cobrança existente antes de trocar o método.');
    const payment = await this.prisma.$transaction(async tx => {
      await this.lockBolao(tx, share.bolaoId);
      const current = await tx.cota.findUniqueOrThrow({ where: { id: share.id }, include: { pagamento: true, bolao: { include: { concurso: { include: { resultado: true } } } } } });
      if (current.status !== StatusCota.reservada || current.bolao.status !== StatusBolao.aberto || current.bolao.concurso.cutoffAt <= new Date() || current.bolao.concurso.status !== 'aberto' || current.bolao.concurso.resultado || (current.expiraReservaEm && current.expiraReservaEm <= new Date())) throw new ConflictException('Reserva indisponível.');
      if (current.pagamento?.pspTransactionId) throw new ConflictException('Já existe uma cobrança. Recarregue para consultá-la.');
      if (current.pagamento && (current.pagamento.status !== StatusPagamento.falhou || !['cora', 'mercadopago'].includes(provider.name))) throw new ConflictException('Cobrança em processamento ou resultado incerto. Aguarde a conciliação antes de tentar novamente.');
      return current.pagamento
        ? tx.pagamento.update({ where: { id: current.pagamento.id }, data: base })
        : tx.pagamento.create({ data: { cotaId: share.id, ...base } });
    });

    try {
      const created = await provider.createCharge({
        expiresAt: reservationUntil ?? new Date(now.getTime() + this.reservationMinutes * 60_000),
        returnPath: `/checkout/${share.id}`,
        externalReference: payment.id,
        method: dto.metodo,
        value: amounts.gross,
        dueDate,
        customerName: share.comprador.nome,
        customerCpf: share.comprador.cpf,
        customerEmail: share.comprador.email,
        description: `Cota de bolão ${share.bolao.concurso.modalidade} ${share.id.slice(0, 8)}`.trim(),
        idempotencyKey: payment.id,
      });
      const updated = await this.prisma.pagamento.update({
        where: { id: payment.id },
        data: {
          pspTransactionId: created.transactionId,
          qrCodePix: created.qrCode,
          qrCodeUrl: created.qrCodeUrl ?? null,
          linhaDigitavel: created.boleto?.digitableLine ?? null,
          codigoBarras: created.boleto?.barcode ?? null,
          // Cartão: o endereço da página segura do provedor fica em boletoUrl e sai como checkoutUrl (toPublicPayment).
          boletoUrl: created.boleto?.url ?? created.checkoutUrl ?? null,
          status: created.status === 'confirmed' ? StatusPagamento.confirmado : StatusPagamento.pendente,
          confirmadoEm: created.status === 'confirmed' ? new Date() : undefined,
        },
      });
      if (reservationUntil) await this.prisma.cota.update({ where: { id: share.id }, data: { expiraReservaEm: reservationUntil } });
      await this.audit.record(this.prisma, { entidade: 'pagamento', entidadeId: payment.id, evento: 'pagamento.criado', atorId: user.id, payloadDepois: updated as unknown as Prisma.InputJsonValue });
      if (created.status === 'confirmed') await this.confirmPayment(created.transactionId, user.id, undefined, provider.name);
      return this.toPublicPayment(updated);
    } catch (error) {
      await this.prisma.pagamento.updateMany({ where: { id: payment.id, status: StatusPagamento.pendente, pspTransactionId: null }, data: { status: StatusPagamento.falhou } });
      throw error;
    }
  }

  /** Retorna a cobrança ativa de uma cota do próprio usuário (reexibir Pix/boleto). */
  async getForShare(shareId: string, user: AuthUser) {
    const payment = await this.prisma.pagamento.findFirst({ where: { cotaId: shareId, cota: { compradorId: user.id } } });
    if (!payment) throw new NotFoundException('Esta cota ainda não possui cobrança.');
    return this.toPublicPayment(payment);
  }

  /* ------------------------------------------------------------------ */
  /* Eventos do provedor                                                 */
  /* ------------------------------------------------------------------ */

  async handleWebhook(rawBody: string, headers: Record<string, string | undefined>, query: Record<string, string | undefined> = {}, providerName?: string) {
    const provider = this.providerByName(providerName);
    if (!provider) throw new NotFoundException('Provedor de pagamento desconhecido.');
    const event = await provider.resolveWebhook(rawBody, headers, query);
    if (!event) return { ignorado: true };
    return this.applyProviderStatus(event.transactionId, event.status, event.paidAmount, provider.name);
  }

  async applyProviderStatus(transactionId: string, status: ChargeStatus, paidAmount?: number, providerName: string = this.provider.name) {
    const payment = await this.prisma.pagamento.findFirst({ where: { pspTransactionId: transactionId, pspProvedor: providerName }, include: { cota: true } });
    if (!payment) {
      this.logger.warn(`Evento de pagamento sem registro local: ${transactionId}`);
      return { ignorado: true };
    }
    if (status === 'confirmed') {
      if (paidAmount === undefined || !Number.isFinite(paidAmount)) throw new BadRequestException('Provedor não informou o valor pago; conciliação necessária.');
      return this.confirmPayment(transactionId, undefined, paidAmount, providerName);
    }
    if (status === 'pending') return { pendente: true };
    return this.releasePayment(payment.id, status === 'refunded' ? StatusPagamento.estornado : StatusPagamento.falhou);
  }

  async confirmPayment(transactionId: string, actorId?: string, paidAmount?: number, providerName: string = this.provider.name) {
    const payment = await this.prisma.pagamento.findFirst({ where: { pspTransactionId: transactionId, pspProvedor: providerName }, include: { cota: true } });
    if (!payment) throw new NotFoundException('Pagamento não encontrado para confirmação.');
    if (payment.status === StatusPagamento.confirmado && payment.cota.status === StatusCota.paga) return this.toPublicPayment(payment);
    if (paidAmount !== undefined && (!Number.isFinite(paidAmount) || Math.round(paidAmount * 100) !== Math.round(Number(payment.valorBruto) * 100))) {
      await this.audit.record(this.prisma, { entidade: 'pagamento', entidadeId: payment.id, evento: 'pagamento.valor_divergente', atorId: actorId, payloadDepois: { esperado: payment.valorBruto.toFixed(2), recebido: paidAmount } as unknown as Prisma.InputJsonValue });
      return { divergente: true };
    }
    const result = await this.prisma.$transaction((tx) => this.settleTx(tx, payment, actorId, 'pagamento.confirmado'));
    await this.afterSettled(result.id);
    return this.toPublicPayment(result);
  }

  /**
   * Efetiva um pagamento recebido. Se a reserva já havia expirado (pagamento tardio),
   * reativa a cota quando ainda há estoque; caso contrário mantém o pagamento como
   * "sem cota" para estorno manual — nunca vende acima do total do bolão.
   */
  private async settleTx(tx: Tx, payment: PaymentRow & { cota?: unknown }, actorId: string | undefined, evento: string, extra: Prisma.PagamentoUpdateInput = {}) {
    await this.lockBolao(tx, (await tx.cota.findUniqueOrThrow({ where: { id: payment.cotaId }, select: { bolaoId: true } })).bolaoId);
    payment = await tx.pagamento.findUniqueOrThrow({ where: { id: payment.id } });
    if (payment.status === StatusPagamento.estornado) return payment;
    const cota = await tx.cota.findUniqueOrThrow({ where: { id: payment.cotaId }, include: { bolao: { include: { concurso: { include: { resultado: true } }, jogos: { orderBy: { ordem: 'asc' } } } } } });
    let settled = false;
    let transitioned = false;
    const beforeCutoff = cota.bolao.concurso.cutoffAt > new Date() && cota.bolao.concurso.status === 'aberto' && !cota.bolao.concurso.resultado;
    if (cota.status === StatusCota.reservada && beforeCutoff && cota.bolao.status === StatusBolao.aberto) {
      await tx.cota.update({ where: { id: cota.id }, data: { status: StatusCota.paga, valorPago: payment.valorBruto, expiraReservaEm: null } });
      settled = true;
      transitioned = true;
    } else if (cota.status === StatusCota.cancelada) {
      const hasStock = beforeCutoff && cota.bolao.status === StatusBolao.aberto && (cota.bolao.cotasIlimitadas || (cota.bolao.totalCotas !== null && cota.bolao.cotasVendidas + cota.quantidade <= cota.bolao.totalCotas));
      if (hasStock) {
        await tx.cota.update({ where: { id: cota.id }, data: { status: StatusCota.paga, valorPago: payment.valorBruto, expiraReservaEm: null } });
        await tx.bolao.update({ where: { id: cota.bolaoId }, data: { cotasVendidas: { increment: cota.quantidade } } });
        await this.audit.record(tx, { entidade: 'cota', entidadeId: cota.id, evento: 'cota.reativada_pagamento_tardio', atorId: actorId, payloadDepois: { pagamentoId: payment.id } as unknown as Prisma.InputJsonValue });
        settled = true;
        transitioned = true;
      }
    } else {
      settled = ([StatusCota.paga, StatusCota.registrada, StatusCota.apurada, StatusCota.premiada] as StatusCota[]).includes(cota.status);
    }
    const updatedPayment = await tx.pagamento.update({ where: { id: payment.id }, data: { status: StatusPagamento.confirmado, confirmadoEm: payment.confirmadoEm ?? new Date(), ...extra } });
    await this.audit.record(tx, { entidade: 'pagamento', entidadeId: payment.id, evento: settled ? evento : 'pagamento.sem_cota', atorId: actorId, payloadAntes: payment as unknown as Prisma.InputJsonValue, payloadDepois: updatedPayment as unknown as Prisma.InputJsonValue });
    if (transitioned) {
      const valor = Number(payment.valorBruto).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
      const jogos = (cota.bolao.jogos ?? []).map(g => ({ ordem: g.ordem, numeros: g.numeros }));
      await tx.notificacao.create({ data: { usuarioId: cota.compradorId, canal: 'push', tipo: 'pagamento.confirmado', payload: { titulo: 'Pagamento confirmado', mensagem: `Recebemos ${valor}. Consulte o recibo interno e os arquivos disponíveis na sua conta. A confirmação do pagamento não substitui o comprovante oficial de registro da aposta.`, link: '/minha-conta', cotaId: cota.id, jogos, valorJogo: payment.valorCustoBilhete.toFixed(2), taxaAdministracao: payment.valorTaxaAdmin.toFixed(2) } } });
    }
    if (settled && cota.afiliadoReferenciaId && Number(payment.valorComissaoAfiliado) > 0) {
      const fee = Number(payment.valorTaxaAdmin);
      await tx.comissao.upsert({
        where: { cotaId: cota.id },
        create: { afiliadoId: cota.afiliadoReferenciaId, cotaId: cota.id, valor: payment.valorComissaoAfiliado, baseCalculo: payment.valorTaxaAdmin, percentual: new Prisma.Decimal(fee > 0 ? round2((Number(payment.valorComissaoAfiliado) / fee) * 100) : 0), status: StatusComissao.pendente },
        update: {},
      });
      if (transitioned) {
        const seller = await tx.afiliado.findUnique({ where: { id: cota.afiliadoReferenciaId }, select: { usuarioId: true } });
        if (seller && seller.usuarioId !== cota.compradorId) {
          const comissao = Number(payment.valorComissaoAfiliado).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
          await tx.notificacao.create({ data: { usuarioId: seller.usuarioId, canal: 'push', tipo: 'venda.confirmada', payload: { titulo: 'Venda confirmada', mensagem: `${cota.quantidade} ${cota.quantidade === 1 ? 'cota vendida' : 'cotas vendidas'} pelo seu link. Sua comissão: ${comissao}.`, link: '/afiliado' } } });
        }
      }
    }
    return updatedPayment;
  }

  /** Cancela/estorna o pagamento, libera o estoque e cancela a comissão pendente. */
  async releasePayment(paymentId: string, status: 'falhou' | 'estornado', actorId?: string) {
    let payment = await this.prisma.pagamento.findUnique({ where: { id: paymentId }, include: { cota: true } });
    if (!payment) throw new NotFoundException('Pagamento não encontrado.');
    if (status === StatusPagamento.falhou && payment.status === StatusPagamento.confirmado) return this.toPublicPayment(payment);
    if (payment.status === status) return this.toPublicPayment(payment);
    const target = payment;
    let unwind: { pagamentoId: string; compradorId: string; formaBaixa: string | null; valorBruto: number } | null = null;
    const updated = await this.prisma.$transaction(async (tx) => {
      await this.lockBolao(tx, target.cota.bolaoId);
      const payment = await tx.pagamento.findUniqueOrThrow({ where: { id: target.id }, include: { cota: true } });
      if (payment.status === status || payment.status === StatusPagamento.estornado || (status === StatusPagamento.falhou && payment.status === StatusPagamento.confirmado)) return payment;
      const current = await tx.pagamento.update({ where: { id: payment.id }, data: { status } });
      const nextShareStatus = status === StatusPagamento.estornado ? StatusCota.estornada : StatusCota.cancelada;
      const shareUpdated = await tx.cota.update({ where: { id: payment.cotaId }, data: { status: nextShareStatus } });
      if (payment.cota.status !== StatusCota.cancelada && payment.cota.status !== StatusCota.estornada) {
        await tx.bolao.update({ where: { id: payment.cota.bolaoId }, data: { cotasVendidas: { decrement: payment.cota.quantidade } } });
      }
      const cancelled = await tx.comissao.updateMany({ where: { cotaId: payment.cotaId, status: StatusComissao.pendente }, data: { status: StatusComissao.cancelada, observacao: `Venda ${status === 'estornado' ? 'estornada' : 'cancelada'} em ${brazilDate()}` } });
      const alreadyPaid = await tx.comissao.count({ where: { cotaId: payment.cotaId, status: StatusComissao.paga } });
      await this.audit.record(tx, { entidade: 'pagamento', entidadeId: payment.id, evento: `pagamento.${status}`, atorId: actorId, payloadAntes: payment as unknown as Prisma.InputJsonValue, payloadDepois: { pagamento: current, cota: shareUpdated, comissoesCanceladas: cancelled.count, comissaoJaRepassada: alreadyPaid > 0 } as unknown as Prisma.InputJsonValue });
      if (payment.status === StatusPagamento.confirmado) unwind = { pagamentoId: payment.id, compradorId: payment.cota.compradorId, formaBaixa: payment.formaBaixa, valorBruto: Number(payment.valorBruto) };
      return current;
    });
    if (unwind) await this.afterRelease(unwind);
    return this.toPublicPayment(updated);
  }

  /**
   * Conciliação ativa: consulta no provedor as cobranças pendentes (garante a baixa mesmo
   * se o webhook falhar) e cancela cobranças cujas reservas já expiraram.
   */
  async reconcilePending(): Promise<{ verificados: number; confirmados: number; cancelados: number; erros: number }> {
    const summary = { verificados: 0, confirmados: 0, cancelados: 0, erros: 0 };
    if (!this.enabled) return summary;
    for (const provider of this.providers.values()) {
      if (!provider.fetchStatus) continue;
      const pending = await this.prisma.pagamento.findMany({
        where: { status: StatusPagamento.pendente, origem: 'gateway', pspProvedor: provider.name, pspTransactionId: { not: null }, criadoEm: { gt: new Date(Date.now() - 10 * 86_400_000) } },
        include: { cota: true },
        orderBy: { criadoEm: 'asc' },
        take: 200,
      });
      for (const payment of pending) {
        summary.verificados += 1;
        try {
          const current = await provider.fetchStatus(payment.pspTransactionId as string);
          if (current.status === 'confirmed') {
            await this.confirmPayment(payment.pspTransactionId as string, undefined, current.paidAmount, provider.name);
            summary.confirmados += 1;
          } else if (current.status === 'failed' || current.status === 'refunded') {
            await this.releasePayment(payment.id, current.status === 'refunded' ? StatusPagamento.estornado : StatusPagamento.falhou);
            summary.cancelados += 1;
          } else if (payment.cota.status === StatusCota.cancelada || payment.cota.status === StatusCota.estornada) {
            await provider.cancelCharge?.(payment.pspTransactionId as string);
            await this.releasePayment(payment.id, StatusPagamento.falhou);
            summary.cancelados += 1;
          }
        } catch (error) {
          summary.erros += 1;
          this.logger.warn(`Conciliação falhou para ${payment.id}: ${(error as Error).message}`);
        }
      }
    }
    return summary;
  }

  /** Registra no painel da Cora os webhooks de cobrança paga e cancelada. */
  async registerCoraWebhooks(actorId: string) {
    const cora = this.coraProvider();
    if (!cora) throw new BadRequestException('O provedor ativo não é a Cora.');
    const url = this.settings().webhookUrl;
    if (!url) throw new BadRequestException('Defina PUBLIC_API_URL (ex.: https://bl.buscarr.com.br) para registrar o webhook.');
    const token = this.config.get<string>('PAYMENT_WEBHOOK_SECRET', '');
    const target = token ? `${url}?token=${encodeURIComponent(token)}` : url;
    const results = await cora.registerWebhooks(target);
    await this.audit.record(this.prisma, { entidade: 'configuracao', entidadeId: actorId, evento: 'cora.webhook_registrado', atorId: actorId, payloadDepois: { url, resultados: results } as unknown as Prisma.InputJsonValue });
    return { url, resultados: results };
  }

  /* ------------------------------------------------------------------ */
  /* Operação manual (balcão / Pix direto / dinheiro)                    */
  /* ------------------------------------------------------------------ */

  async markPaidManually(shareId: string, dto: ManualPaymentDto, admin: AuthUser) {
    const share = await this.prisma.cota.findUnique({ where: { id: shareId }, include: { bolao: true, afiliadoReferencia: true, pagamento: true } });
    if (!share) throw new NotFoundException('Cota não encontrada.');
    if (share.status !== StatusCota.reservada && share.status !== StatusCota.cancelada) throw new ConflictException('Somente cotas reservadas (ou expiradas) podem receber baixa manual.');
    if (share.pagamento?.status === StatusPagamento.confirmado) throw new ConflictException('Esta cota já possui pagamento confirmado.');
    const chargeProvider = this.providerByName(share.pagamento?.pspProvedor);
    if (share.pagamento?.pspTransactionId && chargeProvider?.cancelCharge) {
      try { await chargeProvider.cancelCharge(share.pagamento.pspTransactionId); } catch (error) { this.logger.warn(`Não foi possível cancelar a cobrança no provedor: ${(error as Error).message}`); }
    }
    const amounts = this.shareAmounts(share);
    const manualData = { metodo: MetodoPagamento.manual, origem: 'manual', pspProvedor: 'manual', pspTransactionId: null, formaBaixa: dto.forma, observacao: dto.observacao ?? null, baixaPor: admin.id, status: StatusPagamento.pendente, valorBruto: new Prisma.Decimal(amounts.gross), valorTaxaAdmin: new Prisma.Decimal(amounts.adminFee), valorComissaoAfiliado: new Prisma.Decimal(amounts.affiliateCommission), valorCustoBilhete: new Prisma.Decimal(amounts.cost) };
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockBolao(tx, share.bolaoId);
      const freshShare = await tx.cota.findUniqueOrThrow({ where: { id: share.id }, include: { pagamento: true } });
      if (![StatusCota.reservada, StatusCota.cancelada].includes(freshShare.status as 'reservada' | 'cancelada') || freshShare.pagamento?.status === StatusPagamento.confirmado) throw new ConflictException('Pagamento ou cota mudou; recarregue.');
      const row = freshShare.pagamento
        ? await tx.pagamento.update({ where: { id: freshShare.pagamento!.id }, data: manualData })
        : await tx.pagamento.create({ data: { cotaId: share.id, ...manualData } });
      const settled = await this.settleTx(tx, row, admin.id, 'pagamento.baixa_manual');
      const fresh = await tx.cota.findUniqueOrThrow({ where: { id: share.id } });
      if (fresh.status !== StatusCota.paga) throw new ConflictException('Não há mais cotas disponíveis neste bolão para reativar esta reserva.');
      return settled;
    });
    await this.afterSettled(result.id);
    return this.toPublicPayment(result);
  }

  /** Depois da baixa: cashback de indicação. Roda em transação própria; qualquer falha aqui nunca desfaz o pagamento. */
  private async afterSettled(paymentId: string): Promise<void> {
    try {
      const payment = await this.prisma.pagamento.findUnique({ where: { id: paymentId }, include: { cota: { select: { compradorId: true, status: true } } } });
      if (!payment || payment.status !== StatusPagamento.confirmado || !([StatusCota.paga, StatusCota.registrada, StatusCota.apurada, StatusCota.premiada] as StatusCota[]).includes(payment.cota.status)) return;
      await this.prisma.$transaction((tx) => grantReferralCashback(tx, { pagamentoId: payment.id, compradorId: payment.cota.compradorId, taxaAdmin: Number(payment.valorTaxaAdmin), comissaoAfiliado: Number(payment.valorComissaoAfiliado) }));
    } catch (error) { this.logger.warn(`Cashback de indicação não registrado: ${error instanceof Error ? error.message : String(error)}`); }
  }

  /** Depois do estorno: devolve o saldo usado na compra e desfaz o cashback. Idempotente. */
  private async afterRelease(input: { pagamentoId: string; compradorId: string; formaBaixa: string | null; valorBruto: number }): Promise<void> {
    try { await this.prisma.$transaction((tx) => unwindWalletForPayment(tx, input)); }
    catch (error) { this.logger.error(`Carteira não ajustada no estorno do pagamento ${input.pagamentoId}: ${error instanceof Error ? error.message : String(error)}`); }
  }

  /**
   * Paga a cota inteira com o crédito da carteira (sem cobrança no banco). Só vale quando o saldo cobre o valor todo;
   * o desconto do saldo e a baixa da cota acontecem juntos, na mesma transação.
   */
  async payWithBalance(shareId: string, user: AuthUser) {
    const share = await this.prisma.cota.findUnique({ where: { id: shareId }, include: { bolao: true, afiliadoReferencia: true, pagamento: true } });
    if (!share) throw new NotFoundException('Cota não encontrada.');
    if (share.compradorId !== user.id) throw new ConflictException('A cota não pertence ao usuário autenticado.');
    if (share.status !== StatusCota.reservada || (share.expiraReservaEm && share.expiraReservaEm <= new Date())) throw new ConflictException('A reserva não está mais disponível para pagamento.');
    if (share.pagamento?.status === StatusPagamento.confirmado) throw new ConflictException('Esta cota já está paga.');
    const amounts = this.shareAmounts(share);
    const grossCents = Math.round(amounts.gross * 100);
    const chargeProvider = this.providerByName(share.pagamento?.pspProvedor);
    if (share.pagamento?.pspTransactionId && chargeProvider?.cancelCharge) {
      try { await chargeProvider.cancelCharge(share.pagamento.pspTransactionId); } catch (error) { this.logger.warn(`Não foi possível cancelar a cobrança no provedor: ${(error as Error).message}`); }
    }
    const data = { metodo: MetodoPagamento.manual, origem: 'saldo', pspProvedor: 'saldo', pspTransactionId: null, formaBaixa: 'saldo_bl', observacao: 'Pago com crédito da carteira BL', baixaPor: user.id, status: StatusPagamento.pendente, valorBruto: new Prisma.Decimal(amounts.gross), valorTaxaAdmin: new Prisma.Decimal(amounts.adminFee), valorComissaoAfiliado: new Prisma.Decimal(amounts.affiliateCommission), valorCustoBilhete: new Prisma.Decimal(amounts.cost) };
    const result = await this.prisma.$transaction(async (tx) => {
      await this.lockBolao(tx, share.bolaoId);
      await lockWallet(tx, user.id);
      const fresh = await tx.cota.findUniqueOrThrow({ where: { id: share.id }, include: { pagamento: true } });
      if (fresh.status !== StatusCota.reservada || fresh.pagamento?.status === StatusPagamento.confirmado) throw new ConflictException('Pagamento ou cota mudou; recarregue.');
      const balance = await walletBalance(tx, user.id);
      if (balance < grossCents) throw new ConflictException('O saldo da carteira não cobre o valor desta cota. Pague com Pix ou cartão.');
      const row = fresh.pagamento ? await tx.pagamento.update({ where: { id: fresh.pagamento.id }, data }) : await tx.pagamento.create({ data: { cotaId: share.id, ...data } });
      await addEntry(tx, { usuarioId: user.id, tipo: WALLET_KINDS.purchase, valorCentavos: -grossCents, descricao: 'Compra de cota paga com a carteira', chave: `compra:${row.id}` });
      const settled = await this.settleTx(tx, row, user.id, 'pagamento.saldo_bl');
      const after = await tx.cota.findUniqueOrThrow({ where: { id: share.id } });
      if (after.status !== StatusCota.paga) throw new ConflictException('Não há mais cotas disponíveis neste bolão para esta reserva.');
      return settled;
    });
    await this.afterSettled(result.id);
    return this.toPublicPayment(result);
  }

  async manualSale(dto: ManualSaleDto, admin: AuthUser) {
    if (!dto.aceiteTermoConfirmado) throw new BadRequestException('Confirme que o participante aceitou o termo de participação.');
    if (dto.pago && !dto.forma) throw new BadRequestException('Informe a forma de pagamento recebida.');
    const user = await this.prisma.usuario.findUnique({ where: { id: dto.usuarioId } });
    if (!user) throw new NotFoundException('Participante não encontrado.');
    const affiliate = dto.codigoAfiliado ? await this.prisma.afiliado.findFirst({ where: { codigoAfiliado: dto.codigoAfiliado, statusAprovacao: 'aprovado' } }) : null;
    if (dto.codigoAfiliado && !affiliate) throw new NotFoundException('Código de afiliado não encontrado.');
    const document = approvedDocument('participacao');
    if (dto.termoMandatoHash !== document.hash) throw new ConflictException('O contrato mudou. Releia e registre novamente o aceite presencial.');

    const shareId = await this.prisma.$transaction(async (tx) => {
      await this.lockBolao(tx, dto.bolaoId);
      const pool = await tx.bolao.findUnique({ where: { id: dto.bolaoId }, include: { concurso: { include: { resultado: true } } } });
      if (!pool) throw new NotFoundException('Bolão não encontrado.');
      if (pool.comprovanteAntesVenda && !await hasSaleProof(tx, pool.id)) throw new ConflictException('Envie o comprovante oficial antes da venda.');
      if (pool.concurso.cutoffAt <= new Date() || pool.concurso.status !== 'aberto' || pool.concurso.resultado) throw new ConflictException('Prazo de compra encerrado.');
      if (pool.status !== StatusBolao.aberto) throw new ConflictException('O bolão não está aberto para vendas.');
      if (!pool.cotasIlimitadas && (pool.totalCotas === null || pool.cotasVendidas + dto.quantidade > pool.totalCotas)) throw new ConflictException('Não há cotas suficientes disponíveis.');
      const share = await tx.cota.create({ data: { bolaoId: pool.id, compradorId: user.id, titularCpf: user.cpf, titularNome: user.nome, quantidade: dto.quantidade, status: StatusCota.reservada, expiraReservaEm: null, afiliadoReferenciaId: affiliate?.id ?? null, origemVenda: 'manual' } });
      await tx.mandato.create({ data: { cotaId: share.id, usuarioId: user.id, textoHash: document.hash, textoSnapshot: document.texto, versao: document.versao, pedidoSnapshot: { origemAceite: 'ateste_presencial_do_operador', operadorId: admin.id, bolaoId: pool.id, quantidade: dto.quantidade, valorCota: pool.valorCota.toString(), taxaAdministracaoPct: pool.taxaAdministracaoPct.toString() }, ipAceite: 'admin-manual', userAgent: `admin:${admin.id}` } });
      await tx.bolao.update({ where: { id: pool.id }, data: { cotasVendidas: { increment: dto.quantidade } } });
      await this.audit.record(tx, { entidade: 'cota', entidadeId: share.id, evento: 'cota.venda_manual', atorId: admin.id, payloadDepois: { bolaoId: pool.id, usuarioId: user.id, quantidade: dto.quantidade, pago: dto.pago, observacao: dto.observacao } as unknown as Prisma.InputJsonValue });
      return share.id;
    });
    if (dto.pago) await this.markPaidManually(shareId, { forma: dto.forma as ManualPaymentDto['forma'], observacao: dto.observacao }, admin);
    return { cotaId: shareId, pago: dto.pago };
  }

  /**
   * Compra que não foi concluída (cancelada, expirada ou com cobrança que falhou) não é venda.
   * O administrador pode apagar esse registro. Nunca apaga cota paga, estornada, com nota emitida,
   * comissão paga ou cobrança recente que ainda pode ser paga.
   */
  async deleteFailedShare(shareId: string, admin: AuthUser) {
    return this.prisma.$transaction(async (tx) => {
      const found = await tx.cota.findUnique({ where: { id: shareId }, select: { bolaoId: true } });
      if (!found) throw new NotFoundException('Cota não encontrada.');
      await this.lockBolao(tx, found.bolaoId);
      const share = await tx.cota.findUnique({ where: { id: shareId }, include: { pagamento: { include: { notaFiscal: true } }, comissao: true, _count: { select: { anexos: true } } } });
      if (!share) throw new NotFoundException('Cota não encontrada.');
      const expiredReservation = share.status === StatusCota.reservada && share.expiraReservaEm !== null && share.expiraReservaEm <= new Date();
      if (share.status !== StatusCota.cancelada && !expiredReservation) throw new ConflictException('Só é possível excluir compra cancelada, vencida ou que falhou. Cancele a reserva antes, se ela ainda estiver valendo.');
      const payment = share.pagamento;
      if (payment && ([StatusPagamento.confirmado, StatusPagamento.estornado] as StatusPagamento[]).includes(payment.status)) throw new ConflictException('Há pagamento confirmado ou estornado: o histórico financeiro fica guardado.');
      if (payment?.status === StatusPagamento.pendente && Date.now() - payment.criadoEm.getTime() < 2 * 3600_000) throw new ConflictException('A cobrança é recente e ainda pode ser paga. Tente de novo em algumas horas.');
      if (payment?.notaFiscal && ['emitida', 'cancelada'].includes(payment.notaFiscal.status)) throw new ConflictException('Há nota fiscal emitida: o histórico fiscal fica guardado.');
      if (share.comissao?.status === StatusComissao.paga) throw new ConflictException('A comissão desta cota já foi paga.');
      if (share._count.anexos) throw new ConflictException('Há arquivos anexados a esta cota. Remova os anexos antes.');
      if (expiredReservation) await tx.bolao.update({ where: { id: share.bolaoId }, data: { cotasVendidas: { decrement: share.quantidade } } });
      if (payment) await tx.notaFiscal.deleteMany({ where: { pagamentoId: payment.id } });
      await tx.comissao.deleteMany({ where: { cotaId: share.id } });
      await tx.mandato.deleteMany({ where: { cotaId: share.id } });
      await tx.pagamento.deleteMany({ where: { cotaId: share.id } });
      await this.audit.record(tx, { entidade: 'cota', entidadeId: share.id, evento: 'cota.registro_excluido', atorId: admin.id, payloadAntes: { status: share.status, quantidade: share.quantidade, pagamento: payment?.status ?? null, bolaoId: share.bolaoId } as unknown as Prisma.InputJsonValue });
      await tx.cota.delete({ where: { id: share.id } });
      return { id: share.id, excluida: true };
    });
  }

  /** Limpa de uma vez as compras que não se concluíram (opcionalmente só de um bolão). */
  async purgeFailedShares(admin: AuthUser, poolId?: string) {
    const candidates = await this.prisma.cota.findMany({ where: { ...(poolId ? { bolaoId: poolId } : {}), OR: [{ status: StatusCota.cancelada }, { status: StatusCota.reservada, expiraReservaEm: { lte: new Date() } }] }, select: { id: true }, take: 500 });
    let deleted = 0; let kept = 0;
    for (const candidate of candidates) {
      try { await this.deleteFailedShare(candidate.id, admin); deleted += 1; } catch { kept += 1; }
    }
    return { excluidas: deleted, mantidas: kept };
  }

  async cancelShare(shareId: string, dto: CancelShareDto, admin: AuthUser) {
    const share = await this.prisma.cota.findUnique({ where: { id: shareId }, include: { pagamento: true } });
    if (!share) throw new NotFoundException('Cota não encontrada.');
    if (([StatusCota.registrada, StatusCota.apurada, StatusCota.premiada] as StatusCota[]).includes(share.status)) throw new ForbiddenException('Cotas já registradas na loteria não podem ser canceladas por aqui.');
    if (share.status === StatusCota.cancelada || share.status === StatusCota.estornada) throw new ConflictException('A cota já está cancelada.');
    const chargeProvider = this.providerByName(share.pagamento?.pspProvedor);
    if (share.pagamento?.pspTransactionId && share.pagamento.status === StatusPagamento.pendente && chargeProvider?.cancelCharge) {
      try { await chargeProvider.cancelCharge(share.pagamento.pspTransactionId); } catch (error) { this.logger.warn(`Cobrança não cancelada no provedor: ${(error as Error).message}`); }
    }
    if (share.pagamento?.status === StatusPagamento.confirmado && share.pagamento.origem === 'gateway') throw new ConflictException('Solicite o estorno no provedor e aguarde a confirmação do webhook. Cancelamento local não devolve dinheiro.');
    if (share.pagamento) return this.releasePayment(share.pagamento.id, share.pagamento.status === StatusPagamento.confirmado ? StatusPagamento.estornado : StatusPagamento.falhou, admin.id);
    await this.prisma.$transaction(async (tx) => {
      await this.lockBolao(tx, share.bolaoId);
      const current = await tx.cota.findUniqueOrThrow({ where: { id: share.id }, include: { pagamento: true } });
      if (current.pagamento || current.status !== StatusCota.reservada) throw new ConflictException('A cota mudou durante o cancelamento. Recarregue.');
      await tx.cota.update({ where: { id: share.id }, data: { status: StatusCota.cancelada } });
      await tx.bolao.update({ where: { id: share.bolaoId }, data: { cotasVendidas: { decrement: share.quantidade } } });
      await tx.comissao.updateMany({ where: { cotaId: share.id, status: StatusComissao.pendente }, data: { status: StatusComissao.cancelada } });
      await this.audit.record(tx, { entidade: 'cota', entidadeId: share.id, evento: 'cota.cancelada_admin', atorId: admin.id, payloadDepois: { motivo: dto.motivo } as unknown as Prisma.InputJsonValue });
    });
    return { cancelada: true };
  }

  /* ------------------------------------------------------------------ */

  private async lockBolao(tx: Tx, bolaoId: string) {
    await tx.$queryRaw`SELECT id FROM boloes WHERE id = ${bolaoId}::uuid FOR UPDATE`;
  }

  toPublicPayment(payment: PaymentRow) {
    return {
      id: payment.id,
      status: payment.status,
      metodo: payment.metodo,
      origem: payment.origem,
      valorBruto: payment.valorBruto.toFixed(2),
      valorTaxaAdmin: payment.valorTaxaAdmin.toFixed(2),
      valorComissaoAfiliado: payment.valorComissaoAfiliado.toFixed(2),
      valorCustoBilhete: payment.valorCustoBilhete.toFixed(2),
      qrCodePix: payment.qrCodePix,
      qrCodeUrl: payment.qrCodeUrl,
      linhaDigitavel: payment.linhaDigitavel,
      codigoBarras: payment.codigoBarras,
      boletoUrl: payment.metodo === 'cartao' ? null : payment.boletoUrl,
      /** Cartão: página segura do provedor onde o cliente paga. */
      checkoutUrl: payment.metodo === 'cartao' ? payment.boletoUrl : null,
      vencimentoEm: payment.vencimentoEm,
      pspTransactionId: payment.pspTransactionId,
    };
  }
}
