import { Module } from '@nestjs/common';
import { ScheduleModule } from '@nestjs/schedule';
import { SharesController } from './shares.controller';
import { SharesService } from './shares.service';
import { ReservationExpiryJob } from './reservation-expiry.job';

@Module({
  imports: [ScheduleModule.forRoot()],
  controllers: [SharesController],
  providers: [SharesService, ReservationExpiryJob],
  exports: [SharesService],
})
export class SharesModule {}
