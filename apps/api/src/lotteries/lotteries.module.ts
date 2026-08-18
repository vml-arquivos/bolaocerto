import { Module } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { LotteriesController } from './lotteries.controller';
import { LotteriesService } from './lotteries.service';

@Module({
  controllers: [LotteriesController],
  providers: [PrismaService, LotteriesService],
  exports: [LotteriesService],
})
export class LotteriesModule {}
