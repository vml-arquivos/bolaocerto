import { Module } from '@nestjs/common';
import { FunnelAdminController, FunnelPublicController } from './funnel.controller';
import { FunnelService } from './funnel.service';

@Module({ controllers: [FunnelPublicController, FunnelAdminController], providers: [FunnelService] })
export class FunnelModule {}
