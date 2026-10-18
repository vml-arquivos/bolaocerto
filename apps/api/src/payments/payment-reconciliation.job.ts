import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PaymentsService } from './payments.service';

/** Garante a baixa de pagamentos mesmo se o webhook falhar e cancela cobranças de reservas expiradas. */
@Injectable()
export class PaymentReconciliationJob {
  private readonly logger = new Logger(PaymentReconciliationJob.name);
  private running = false;

  constructor(private readonly payments: PaymentsService) {}

  @Cron('*/3 * * * *')
  async run() {
    if (this.running) return;
    this.running = true;
    try {
      const result = await this.payments.reconcilePending();
      if (result.verificados > 0) this.logger.log(`Conciliação: ${JSON.stringify(result)}`);
    } catch (error) {
      this.logger.error(`Conciliação falhou: ${(error as Error).message}`);
    } finally {
      this.running = false;
    }
  }
}
