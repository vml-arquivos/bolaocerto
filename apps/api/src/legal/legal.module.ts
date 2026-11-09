import { Module } from '@nestjs/common';
import { LegalAdminController } from './legal-admin.controller';
import { LegalPublishingService } from './legal-publishing.service';

@Module({ controllers: [LegalAdminController], providers: [LegalPublishingService], exports: [LegalPublishingService] })
export class LegalModule {}
