import { Controller, Get } from '@nestjs/common';
import { PrismaService } from './common/prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService) {}

  @Get('health')
  async health() {
    await this.prisma.$queryRaw`SELECT 1`;
    return { status: 'ok', service: 'bl-api', timestamp: new Date().toISOString() };
  }
}
