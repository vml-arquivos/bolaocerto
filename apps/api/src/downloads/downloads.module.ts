import { Module } from '@nestjs/common';
import { SharesModule } from '../shares/shares.module';
import { DownloadsController, MyNoteController } from './downloads.controller';
import { DownloadsService } from './downloads.service';

@Module({ imports: [SharesModule], controllers: [DownloadsController, MyNoteController], providers: [DownloadsService] })
export class DownloadsModule {}
