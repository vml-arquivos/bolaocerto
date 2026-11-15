import { ShareSaleTransferService } from './share-sale-transfer.service';
import { AdminUsersService } from './admin-users.service';
import { AdminUsersController } from './admin-users.controller';
import { Module } from '@nestjs/common';
import { AffiliateRulesController } from '../affiliate-rules/affiliate-rules.controller';
import { AdminController } from './admin.controller';
import { AdminService } from './admin.service';

@Module({
  controllers: [AdminController, AdminUsersController, AffiliateRulesController],
  providers: [AdminService, AdminUsersService, ShareSaleTransferService],
  exports: [AdminService],
})
export class AdminModule {}
