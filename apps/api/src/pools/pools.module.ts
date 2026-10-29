import { PricingAdminController } from '../pricing/pricing-admin.controller';
import { PricingService } from '../pricing/pricing.service';
import { Module } from '@nestjs/common';
import { PoolsController } from './pools.controller';
import { PoolsService } from './pools.service';

@Module({
  controllers: [PoolsController, PricingAdminController],
  providers: [PoolsService, PricingService],
  exports: [PoolsService],
})
export class PoolsModule {}
