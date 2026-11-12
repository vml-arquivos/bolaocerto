import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { APP_FILTER } from '@nestjs/core';
import { ScheduleModule } from '@nestjs/schedule';
import { AllExceptionsFilter } from './common/exceptions.filter';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { LotteriesModule } from './lotteries/lotteries.module';
import { PoolsModule } from './pools/pools.module';
import { SharesModule } from './shares/shares.module';
import { PaymentsModule } from './payments/payments.module';
import { FiscalModule } from './fiscal/fiscal.module';
import { ReportsModule } from './reports/reports.module';
import { DownloadsModule } from './downloads/downloads.module';
import { BlogModule } from './blog/blog.module';
import { AdminModule } from './admin/admin.module';
import { CrmModule } from './crm/crm.module';
import { StatisticsModule } from './statistics/statistics.module';
import { NotificationsModule } from './notifications/notifications.module';
import { AccountModule } from './account/account.module';
import { OperationModule } from './operation/operation.module';
import { AttachmentsModule } from './attachments/attachments.module';
import { SystemModule } from './system/system.module';
import { HomeModule } from './home/home.module';
import { NumbersModule } from './numbers/numbers.module';
import { LegalModule } from './legal/legal.module';
import { FunnelModule } from './funnel/funnel.module';
import { ConferidorModule } from './conferidor/conferidor.module';
import { ModalityAlertsModule } from './alerts/modality-alerts.module';
import { WalletModule } from './wallet/wallet.module';
import { PromotionsModule } from './promotions/promotions.module';
import { HealthController } from './health.controller';

@Module({
  imports: [
    CommonModule,
    ConfigModule.forRoot({ isGlobal: true, cache: true }),
    ScheduleModule.forRoot(),
    AuthModule,
    LotteriesModule,
    PoolsModule,
    SharesModule,
    PaymentsModule,
    FiscalModule,
    ReportsModule,
    DownloadsModule,
    BlogModule,
    AdminModule,
    CrmModule,
    StatisticsModule,
    NotificationsModule,
    AccountModule,
    AttachmentsModule,
    SystemModule,
    HomeModule,
    NumbersModule,
    OperationModule,
    LegalModule,
    FunnelModule,
    ConferidorModule,
    ModalityAlertsModule,
    WalletModule,
    PromotionsModule,
  ],
  controllers: [HealthController],
  providers: [{ provide: APP_FILTER, useClass: AllExceptionsFilter }],
})
export class AppModule {}
