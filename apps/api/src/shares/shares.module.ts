import { LegalController } from '../legal/legal.controller';
import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SharesController } from './shares.controller';
import { SharesService } from './shares.service';
import { ReservationExpiryJob } from './reservation-expiry.job';
import { PublicConfigController } from './public-config.controller';
import { ReceiptVerifyController } from './receipt-verify.controller';
import { AffiliateClientLinker } from './affiliate-client-linker';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [LegalController, SharesController, PublicConfigController, ReceiptVerifyController],
  providers: [SharesService, ReservationExpiryJob, AffiliateClientLinker],
  exports: [SharesService],
})
export class SharesModule {}
