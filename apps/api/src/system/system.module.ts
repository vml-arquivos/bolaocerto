import { Module } from '@nestjs/common';
import { AttachmentsModule } from '../attachments/attachments.module';
import { ConnectionsController } from './connections.controller';
import { ConnectionsService } from './connections.service';

@Module({ imports: [AttachmentsModule], controllers: [ConnectionsController], providers: [ConnectionsService] })
export class SystemModule {}
