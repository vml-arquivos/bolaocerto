import { Global, Module } from '@nestjs/common';
import { AlertService } from './alert.service';
import { AuditService } from './audit.service';
import { MailService } from './mail.service';
import { PrismaService } from './prisma.service';
import { ResponsiblePlayService } from './responsible-play.service';

@Global()
@Module({
  providers: [PrismaService, AuditService, MailService, AlertService, ResponsiblePlayService],
  exports: [PrismaService, AuditService, MailService, AlertService, ResponsiblePlayService],
})
export class CommonModule {}
