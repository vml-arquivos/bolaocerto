import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { ContractsController } from './contracts.controller';
import { ContractsService } from './contracts.service';
import { IdentityDocumentService } from './identity-document';

@Module({ imports: [AttachmentsModule], controllers: [ContractsController], providers: [ContractsService, IdentityDocumentService], exports: [ContractsService] })
export class ContractsModule {}
