import { Body, Controller, Get, Put, UseGuards } from '@nestjs/common';
import { ArrayMaxSize, IsArray, IsString, Length } from 'class-validator';
import { CurrentUser } from '../auth/auth.decorators';
import { AuthUser } from '../auth/auth.utils';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { PrismaService } from '../common/prisma.service';

export class SetModalityAlertsDto {
  @IsArray() @ArrayMaxSize(20) @IsString({ each: true }) @Length(2, 30, { each: true }) modalidades!: string[];
}

/** Preferências de "avise-me quando abrir bolão de [jogo]" da própria conta. */
@Controller('usuarios/me/alertas-bolao')
@UseGuards(JwtAuthGuard)
export class ModalityAlertsController {
  constructor(private readonly prisma: PrismaService) {}

  private async available() {
    return this.prisma.configLoteria.findMany({ select: { modalidade: true, nomeExibicao: true }, orderBy: { nomeExibicao: 'asc' } });
  }

  @Get()
  async get(@CurrentUser() user: AuthUser) {
    const [available, chosen] = await Promise.all([this.available(), this.prisma.alertaModalidade.findMany({ where: { usuarioId: user.id }, select: { modalidade: true } })]);
    return { modalidades: chosen.map((row) => row.modalidade), disponiveis: available.map((row) => ({ modalidade: row.modalidade, nome: row.nomeExibicao })) };
  }

  @Put()
  async set(@Body() dto: SetModalityAlertsDto, @CurrentUser() user: AuthUser) {
    const valid = new Set((await this.available()).map((row) => row.modalidade));
    const wanted = [...new Set(dto.modalidades)].filter((key) => valid.has(key));
    await this.prisma.$transaction([
      this.prisma.alertaModalidade.deleteMany({ where: { usuarioId: user.id } }),
      ...(wanted.length ? [this.prisma.alertaModalidade.createMany({ data: wanted.map((modalidade) => ({ usuarioId: user.id, modalidade })) })] : []),
    ]);
    return { modalidades: wanted };
  }
}
