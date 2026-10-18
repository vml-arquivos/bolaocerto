import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SharesController } from './shares.controller';
import { SharesService } from './shares.service';
import { ReservationExpiryJob } from './reservation-expiry.job';
import { PublicConfigController } from './public-config.controller';
import { ReceiptVerifyController } from './receipt-verify.controller';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SharesController, PublicConfigController, ReceiptVerifyController],
  providers: [SharesService, ReservationExpiryJob],
  exports: [SharesService],
})
export class SharesModule {}
