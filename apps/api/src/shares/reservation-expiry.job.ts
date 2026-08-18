import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { SharesService } from './shares.service';

@Injectable()
export class ReservationExpiryJob {
  private readonly logger = new Logger(ReservationExpiryJob.name);

  constructor(private readonly shares: SharesService) {}

  @Cron('*/1 * * * *')
  async expire(): Promise<void> {
    const count = await this.shares.expireReservations();
    if (count > 0) this.logger.log(`Reservas expiradas: ${count}`);
  }
}
