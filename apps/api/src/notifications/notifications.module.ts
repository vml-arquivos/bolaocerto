import { Global, Module } from '@nestjs/common';
import { StorageService } from '../attachments/storage.service';
import { CommunicationsController } from './communications.controller';
import { CommunicationsService } from './communications.service';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PoolReleaseWatcher } from './pool-release.watcher';
import { PushController } from './push.controller';
import { PushService } from './push.service';

@Global()
@Module({
  controllers: [NotificationsController, PushController, CommunicationsController],
  providers: [NotificationsService, PoolReleaseWatcher, PushService, CommunicationsService, StorageService],
  exports: [NotificationsService, PushService],
})
export class NotificationsModule {}
