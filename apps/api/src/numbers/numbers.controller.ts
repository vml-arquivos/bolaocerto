import { Body, Controller, Delete, Get, Param, ParseUUIDPipe, Post, Query, UseGuards } from '@nestjs/common';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.utils';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AddBankDto, GenerateBankDto, ListBankQueryDto, MarkUsedDto } from './numbers.dto';
import { NumbersService } from './numbers.service';

@Controller('admin/numeros')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class NumbersController {
  constructor(private readonly numbers: NumbersService) {}

  @Get() list(@Query() query: ListBankQueryDto) { return this.numbers.list(query); }
  @Get('regras') rules() { return this.numbers.modalities(); }
  @Post('gerar') generate(@Body() dto: GenerateBankDto, @CurrentUser() user: AuthUser) { return this.numbers.generate(dto, user.id); }
  @Post() add(@Body() dto: AddBankDto, @CurrentUser() user: AuthUser) { return this.numbers.add(dto, user.id); }
  @Post('usar') used(@Body() dto: MarkUsedDto, @CurrentUser() user: AuthUser) { return this.numbers.markUsed(dto, user.id); }
  @Delete(':id') remove(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.numbers.remove(id, user.id); }
}
