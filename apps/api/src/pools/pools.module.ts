import { PricingAdminController } from '../pricing/pricing-admin.controller';
import { PricingService } from '../pricing/pricing.service';
import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { StatisticsModule } from '../statistics/statistics.module';
import { PoolsController } from './pools.controller';
import { PoolsService } from './pools.service';

@Module({
  imports: [StatisticsModule, AttachmentsModule],
  controllers: [PoolsController, PricingAdminController],
  providers: [PoolsService, PricingService],
  exports: [PoolsService],
})
export class PoolsModule {}
