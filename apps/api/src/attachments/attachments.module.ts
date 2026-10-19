import { Module } from '@nestjs/common';
import { AttachmentsDownloadController, AttachmentsStaffController } from './attachments.controller';
import { AttachmentsService } from './attachments.service';
import { StorageService } from './storage.service';

@Module({
  controllers: [AttachmentsStaffController, AttachmentsDownloadController],
  providers: [AttachmentsService, StorageService],
  exports: [AttachmentsService, StorageService],
})
export class AttachmentsModule {}
