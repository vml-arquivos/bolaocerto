import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { ScheduleModule } from '@nestjs/schedule';
import { CommonModule } from './common/common.module';
import { AuthModule } from './auth/auth.module';
import { LotteriesModule } from './lotteries/lotteries.module';
import { PoolsModule } from './pools/pools.module';
import { SharesModule } from './shares/shares.module';
import { PaymentsModule } from './payments/payments.module';
import { AdminModule } from './admin/admin.module';
import { OperationModule } from './operation/operation.module';
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
    AdminModule,
    OperationModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
