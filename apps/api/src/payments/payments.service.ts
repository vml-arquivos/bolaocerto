import { ConflictException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, StatusCota, StatusPagamento } from '@prisma/client';
import { ConfigService } from '@nestjs/config';
import { AuthUser } from '../auth/auth.utils';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { CreatePaymentDto } from './payments.dto';
import { buildPaymentProvider, PaymentProvider } from './payment.provider';

@Injectable()
export class PaymentsService {
  private readonly provider: PaymentProvider;
  private readonly enabled: boolean;

  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, config: ConfigService) {
    this.enabled = config.get<string>('PAYMENTS_ENABLED', 'false') === 'true';
    this.provider = buildPaymentProvider(config);
  }

  async createForShare(shareId: string, dto: CreatePaymentDto, user: AuthUser) {
    if (!this.enabled) throw new ServiceUnavailableException('Pagamentos serão habilitados somente após a conclusão dos testes do sistema.');
    const share = await this.prisma.cota.findUnique({ where: { id: shareId }, include: { bolao: true, comprador: true, afiliadoReferencia: true, pagamento: true } });
    if (!share) throw new NotFoundException('Cota não encontrada.');
    if (share.compradorId !== user.id) throw new ConflictException('A cota não pertence ao usuário autenticado.');
    if (share.status !== StatusCota.reservada || (share.expiraReservaEm && share.expiraReservaEm <= new Date())) throw new ConflictException('A reserva não está mais disponível para pagamento.');
    if (share.pagamento) return this.toPublicPayment(share.pagamento);
    const gross = Number(share.bolao.valorCota) * share.quantidade;
    const adminRate = Number(share.bolao.taxaAdministracaoPct) / 100;
    const cost = gross / (1 + adminRate);
    const adminFee = gross - cost;
    const affiliateRate = share.afiliadoReferencia ? Number(share.afiliadoReferencia.comissaoPadraoPct) / 100 : 0;
    const affiliateCommission = adminFee * affiliateRate;
    const payment = await this.prisma.pagamento.create({ data: { cotaId: share.id, metodo: dto.metodo, valorBruto: new Prisma.Decimal(gross), valorTaxaAdmin: new Prisma.Decimal(adminFee), valorComissaoAfiliado: new Prisma.Decimal(affiliateCommission), valorCustoBilhete: new Prisma.Decimal(cost), status: StatusPagamento.pendente, pspProvedor: process.env.PAYMENT_PROVIDER ?? 'disabled' } });
    try {
      const created = await this.provider.createPixPayment({ externalReference: payment.id, value: gross, customerName: share.comprador.nome, customerCpf: share.comprador.cpf, customerEmail: share.comprador.email, description: `Cota ${share.id} - Bolão ${share.bolao.id}` });
      const updated = await this.prisma.pagamento.update({ where: { id: payment.id }, data: { pspTransactionId: created.transactionId, qrCodePix: created.qrCode, status: created.status === 'confirmed' ? StatusPagamento.confirmado : StatusPagamento.pendente, confirmadoEm: created.status === 'confirmed' ? new Date() : undefined } });
      await this.audit.record(this.prisma, { entidade: 'pagamento', entidadeId: payment.id, evento: 'pagamento.criado', atorId: user.id, payloadDepois: updated as unknown as Prisma.InputJsonValue });
      if (created.status === 'confirmed') await this.confirmPayment(created.transactionId, user.id);
      return this.toPublicPayment(updated);
    } catch (error) {
      await this.prisma.pagamento.update({ where: { id: payment.id }, data: { status: StatusPagamento.falhou } });
      throw error;
    }
  }

  async handleWebhook(rawBody: string, headers: Record<string, string | undefined>) {
    const event = this.provider.verifyWebhook(rawBody, headers);
    if (event.status === 'confirmed') return this.confirmPayment(event.transactionId);
    const payment = await this.prisma.pagamento.findFirst({ where: { pspTransactionId: event.transactionId } });
    if (!payment) throw new NotFoundException('Pagamento não encontrado para o evento.');
    const status = event.status === 'refunded' ? StatusPagamento.estornado : StatusPagamento.falhou;
    const updated = await this.prisma.$transaction(async (tx) => {
      const current = await tx.pagamento.update({ where: { id: payment.id }, data: { status } });
      await tx.cota.update({ where: { id: payment.cotaId }, data: { status: StatusCota[status === StatusPagamento.estornado ? 'estornada' : 'cancelada'] } });
      await this.audit.record(tx, { entidade: 'pagamento', entidadeId: payment.id, evento: `pagamento.${status}`, payloadAntes: payment as unknown as Prisma.InputJsonValue, payloadDepois: current as unknown as Prisma.InputJsonValue });
      return current;
    });
    return this.toPublicPayment(updated);
  }

  private async confirmPayment(transactionId: string, actorId?: string) {
    const payment = await this.prisma.pagamento.findFirst({ where: { pspTransactionId: transactionId }, include: { cota: true } });
    if (!payment) throw new NotFoundException('Pagamento não encontrado para confirmação.');
    if (payment.status === StatusPagamento.confirmado && payment.cota.status === StatusCota.paga) return this.toPublicPayment(payment);
    const result = await this.prisma.$transaction(async (tx) => {
      const updatedPayment = await tx.pagamento.update({ where: { id: payment.id }, data: { status: StatusPagamento.confirmado, confirmadoEm: new Date() } });
      const updatedShare = await tx.cota.update({ where: { id: payment.cotaId }, data: { status: StatusCota.paga, valorPago: payment.valorBruto } });
      await this.audit.record(tx, { entidade: 'pagamento', entidadeId: payment.id, evento: 'pagamento.confirmado', atorId: actorId, payloadAntes: payment as unknown as Prisma.InputJsonValue, payloadDepois: updatedPayment as unknown as Prisma.InputJsonValue });
      await this.audit.record(tx, { entidade: 'cota', entidadeId: payment.cotaId, evento: 'cota.paga', atorId: actorId, payloadAntes: payment.cota as unknown as Prisma.InputJsonValue, payloadDepois: updatedShare as unknown as Prisma.InputJsonValue });
      if (payment.cota.afiliadoReferenciaId && Number(payment.valorComissaoAfiliado) > 0) {
        await tx.comissao.upsert({ where: { cotaId: payment.cotaId }, create: { afiliadoId: payment.cota.afiliadoReferenciaId, cotaId: payment.cotaId, valor: payment.valorComissaoAfiliado }, update: {} });
      }
      return updatedPayment;
    });
    return this.toPublicPayment(result);
  }

  private toPublicPayment(payment: { id: string; status: StatusPagamento; valorBruto: Prisma.Decimal; valorTaxaAdmin: Prisma.Decimal; valorComissaoAfiliado: Prisma.Decimal; valorCustoBilhete: Prisma.Decimal; qrCodePix: string | null; pspTransactionId: string | null }) {
    return { id: payment.id, status: payment.status, valorBruto: payment.valorBruto.toFixed(2), valorTaxaAdmin: payment.valorTaxaAdmin.toFixed(2), valorComissaoAfiliado: payment.valorComissaoAfiliado.toFixed(2), valorCustoBilhete: payment.valorCustoBilhete.toFixed(2), qrCodePix: payment.qrCodePix, pspTransactionId: payment.pspTransactionId };
  }
}
