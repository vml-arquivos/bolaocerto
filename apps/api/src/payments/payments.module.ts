import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentReconciliationJob } from './payment-reconciliation.job';
import { PaymentsAdminController } from './payments-admin.controller';
import { PaymentsController } from './payments.controller';
import { PaymentsService } from './payments.service';

@Module({
  imports: [ConfigModule],
  controllers: [PaymentsController, PaymentsAdminController],
  providers: [PaymentsService, PaymentReconciliationJob],
  exports: [PaymentsService],
})
export class PaymentsModule {}
