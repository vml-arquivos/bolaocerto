import { Global, Module } from '@nestjs/common';
import { NotificationsController } from './notifications.controller';
import { NotificationsService } from './notifications.service';
import { PoolReleaseWatcher } from './pool-release.watcher';

@Global()
@Module({ controllers: [NotificationsController], providers: [NotificationsService, PoolReleaseWatcher], exports: [NotificationsService] })
export class NotificationsModule {}
