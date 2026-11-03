import { Module } from '@nestjs/common';
import { PoolsModule } from '../pools/pools.module';
import { NumbersController } from './numbers.controller';
import { NumbersService } from './numbers.service';

@Module({ imports: [PoolsModule], controllers: [NumbersController], providers: [NumbersService] })
export class NumbersModule {}
