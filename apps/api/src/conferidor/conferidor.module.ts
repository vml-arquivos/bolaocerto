import { Module } from '@nestjs/common';
import { ConferidorController } from './conferidor.controller';
import { ConferidorService } from './conferidor.service';

@Module({ controllers: [ConferidorController], providers: [ConferidorService] })
export class ConferidorModule {}
