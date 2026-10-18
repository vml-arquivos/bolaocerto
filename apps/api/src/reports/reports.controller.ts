import { Controller, Get, Param, ParseUUIDPipe, Query, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Response } from 'express';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { ReportQueryDto } from './reports.dto';
import { ReportFile, ReportsService } from './reports.service';

function respond(result: ReportFile | object, response: Response): StreamableFile | object {
  if (!('buffer' in result)) return result;
  const file = result as ReportFile;
  response.setHeader('Content-Type', file.contentType);
  response.setHeader('Content-Disposition', `attachment; filename="${file.filename}"`);
  response.setHeader('Cache-Control', 'no-store');
  return new StreamableFile(file.buffer);
}

@Controller('admin/relatorios')
@UseGuards(JwtAuthGuard, RolesGuard)
@Roles('admin')
export class ReportsController {
  constructor(private readonly reports: ReportsService) {}

  @Get('resumo')
  async summary(@Query() query: ReportQueryDto, @CurrentUser() admin: AuthUser, @Res({ passthrough: true }) response: Response) {
    return respond(await this.reports.summary(query, admin), response);
  }

  @Get('boloes')
  async pools(@Query() query: ReportQueryDto, @CurrentUser() admin: AuthUser, @Res({ passthrough: true }) response: Response) {
    const result = await this.reports.pools(query, admin);
    return Array.isArray(result) ? result : respond(result, response);
  }

  @Get('vendas')
  async sales(@Query() query: ReportQueryDto, @CurrentUser() admin: AuthUser, @Res({ passthrough: true }) response: Response) {
    return respond(await this.reports.sales(query, admin), response);
  }

  @Get('nao-pagos')
  async unpaid(@Query() query: ReportQueryDto, @CurrentUser() admin: AuthUser, @Res({ passthrough: true }) response: Response) {
    return respond(await this.reports.unpaid(query, admin), response);
  }

  @Get('comissoes')
  async commissions(@Query() query: ReportQueryDto, @CurrentUser() admin: AuthUser, @Res({ passthrough: true }) response: Response) {
    return respond(await this.reports.commissions(query, admin), response);
  }

  @Get('pagamentos')
  async payments(@Query() query: ReportQueryDto, @CurrentUser() admin: AuthUser, @Res({ passthrough: true }) response: Response) {
    return respond(await this.reports.payments(query, admin), response);
  }

  @Get('notas-fiscais')
  async invoices(@Query() query: ReportQueryDto, @CurrentUser() admin: AuthUser, @Res({ passthrough: true }) response: Response) {
    return respond(await this.reports.invoices(query, admin), response);
  }

  @Get('boloes/:id')
  async poolSheet(@Param('id', ParseUUIDPipe) id: string, @Query() query: ReportQueryDto, @CurrentUser() admin: AuthUser, @Res({ passthrough: true }) response: Response) {
    return respond(await this.reports.poolSheet(id, query, admin), response);
  }
}
