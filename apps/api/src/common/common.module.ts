import { Global, Module } from '@nestjs/common';
import { AlertService } from './alert.service';
import { AuditService } from './audit.service';
import { MailService } from './mail.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, AuditService, MailService, AlertService],
  exports: [PrismaService, AuditService, MailService, AlertService],
})
export class CommonModule {}
