import { Global, Module } from '@nestjs/common';
import { AuditService } from './audit.service';
import { MailService } from './mail.service';
import { PrismaService } from './prisma.service';

@Global()
@Module({
  providers: [PrismaService, AuditService, MailService],
  exports: [PrismaService, AuditService, MailService],
})
export class CommonModule {}
