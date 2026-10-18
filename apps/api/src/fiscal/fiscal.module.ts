import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { PaymentsModule } from '../payments/payments.module';
import { NfseAdminController, UserAddressController } from './nfse.controller';
import { NfseJob } from './nfse.job';
import { NfseService } from './nfse.service';

@Module({
  imports: [ConfigModule, PaymentsModule],
  controllers: [NfseAdminController, UserAddressController],
  providers: [NfseService, NfseJob],
  exports: [NfseService],
})
export class FiscalModule {}
