import { Body, Controller, Get, Param, Post, Query, UseGuards } from '@nestjs/common';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { AnalyzeGameDto, ImportHistoryQueryDto, ProbabilityQueryDto, StatsQueryDto, SuggestQueryDto } from './statistics.dto';
import { StatisticsService } from './statistics.service';

@Controller()
export class StatisticsController {
  constructor(private readonly statistics: StatisticsService) {}

  @Get('estatisticas')
  overview() { return this.statistics.overview(); }

  @Get('estatisticas/:modalidade')
  modality(@Param('modalidade') modalidade: string, @Query() query: StatsQueryDto) { return this.statistics.modality(modalidade, query); }

  @Get('estatisticas/:modalidade/probabilidades')
  probabilities(@Param('modalidade') modalidade: string, @Query() query: ProbabilityQueryDto) { return this.statistics.probabilities(modalidade, query); }

  @Post('estatisticas/:modalidade/analisar')
  analyze(@Param('modalidade') modalidade: string, @Body() dto: AnalyzeGameDto) { return this.statistics.analyze(modalidade, dto); }

  @Get('estatisticas/:modalidade/sugestoes')
  suggest(@Param('modalidade') modalidade: string, @Query() query: SuggestQueryDto) { return this.statistics.suggest(modalidade, query); }

  @Post('admin/estatisticas/historico')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles('admin')
  importHistory(@Query() query: ImportHistoryQueryDto, @CurrentUser() admin: AuthUser) { return this.statistics.importHistory(query.modalidade, query.limite ?? 30, admin.id); }
}
