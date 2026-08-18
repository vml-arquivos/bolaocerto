import { Body, Controller, Get, Param, Post, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { RegisterPoolDto } from './operation.dto';
import { OperationService } from './operation.service';

@Controller('operacao')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin', 'operacao')
export class OperationController {
  constructor(private readonly operation: OperationService) {}

  @Get('fila')
  queue() {
    return this.operation.queue();
  }

  @Post('boloes/:id/registrar')
  register(@Param('id') id: string, @Body() dto: RegisterPoolDto, @CurrentUser() user: AuthUser) {
    return this.operation.register(id, dto, user);
  }
}
