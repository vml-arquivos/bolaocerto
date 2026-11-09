import { Module } from '@nestjs/common';
import { AffiliateCrmController } from './crm-afiliado.controller';
import { AffiliateCrmService } from './crm-afiliado.service';
import { CrmController } from './crm.controller';
import { CrmService } from './crm.service';

@Module({ controllers: [CrmController, AffiliateCrmController], providers: [CrmService, AffiliateCrmService] })
export class CrmModule {}
