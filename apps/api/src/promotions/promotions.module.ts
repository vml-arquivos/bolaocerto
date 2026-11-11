import { Module } from '@nestjs/common';
import { CashbackCampaignsAdminController, CouponsAdminController, CouponsClientController, PromotionsPickerController } from './promotions.controller';

@Module({ controllers: [CouponsAdminController, CashbackCampaignsAdminController, PromotionsPickerController, CouponsClientController] })
export class PromotionsModule {}
