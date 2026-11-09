import { Module } from '@nestjs/common';
import { ModalityAlertsController } from './modality-alerts.controller';

@Module({ controllers: [ModalityAlertsController] })
export class ModalityAlertsModule {}
