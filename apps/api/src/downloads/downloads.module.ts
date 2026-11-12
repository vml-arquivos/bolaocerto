import { Module } from '@nestjs/common';
import { SharesModule } from '../shares/shares.module';
import { DownloadsController } from './downloads.controller';
import { DownloadsService } from './downloads.service';

@Module({ imports: [SharesModule], controllers: [DownloadsController], providers: [DownloadsService] })
export class DownloadsModule {}
