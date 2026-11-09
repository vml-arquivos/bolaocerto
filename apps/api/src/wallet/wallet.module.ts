import { Module } from '@nestjs/common';
import { WalletAdminController, WalletController } from './wallet.controller';

@Module({ controllers: [WalletController, WalletAdminController] })
export class WalletModule {}
