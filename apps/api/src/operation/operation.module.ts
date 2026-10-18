import { Module } from '@nestjs/common';
import { OperationController } from './operation.controller';
import { OpsWatchService } from './ops-watch.service';
import { OperationService } from './operation.service';

@Module({
  controllers: [OperationController],
  providers: [OperationService, OpsWatchService],
  exports: [OperationService, OpsWatchService],
})
export class OperationModule {}
