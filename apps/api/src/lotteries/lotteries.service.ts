import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  calculateBrazilCutoff,
  CaixaContestPayload,
  MODALIDADES_LOTERIA,
  ModalidadeLoteria,
  normalizeCaixaContestPayload,
  parseCaixaDate,
} from '@bolaocerto/shared-types';
import { PrismaService } from '../common/prisma.service';

@Injectable()
export class LotteriesService {
  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  async list(modalidade?: string, status?: string) {
    const allowed = modalidade ? this.assertModalidade(modalidade) : undefined;
    const contests = await this.prisma.concurso.findMany({
      where: { ...(allowed ? { modalidade: allowed } : {}), ...(status ? { status } : {}) },
      orderBy: [{ dataSorteio: 'asc' }, { modalidade: 'asc' }],
      take: 100,
    });
    return contests.map((contest) => this.toPublicContest(contest));
  }

  async getById(id: string) {
    const contest = await this.prisma.concurso.findUniqueOrThrow({ where: { id } });
    return this.toPublicContest(contest);
  }

  async getResult(id: string) {
    const result = await this.prisma.resultado.findUniqueOrThrow({ where: { concursoId: id }, include: { concurso: true } });
    return {
      concursoId: result.concursoId,
      modalidade: result.concurso.modalidade,
      numeroConcurso: result.concurso.numeroConcurso,
      numerosSorteados: result.numerosSorteados,
      listaRateioPremio: result.listaRateioPremio,
      apuradoEm: result.apuradoEm,
    };
  }

  async sync(modalidade?: string): Promise<{ sincronizados: number; fontes: string[] }> {
    const modalities = modalidade ? [this.assertModalidade(modalidade)] : [...MODALIDADES_LOTERIA];
    const fontes = new Set<string>();
    let sincronizados = 0;

    for (const current of modalities) {
      const config = await this.prisma.configLoteria.findUnique({ where: { modalidade: current } });
      if (!config) continue;
      const payload = await this.fetchFromCaixa(current);
      const persisted = await this.persistContestPayload(current, config.horarioCorteLocal, payload);
      if (!persisted) continue;
      fontes.add('caixa');
      sincronizados += 1;
    }

    return { sincronizados, fontes: [...fontes] };
  }

  private async persistContestPayload(modalidade: ModalidadeLoteria, horarioCorteLocal: string, rawPayload: unknown): Promise<boolean> {
    const payload = normalizeCaixaContestPayload(rawPayload);
    const currentDrawDate = parseCaixaDate(payload.dataApuracao);
    const nextDrawDate = parseCaixaDate(payload.dataProximoConcurso);
    if (!payload.numero || !payload.numeroConcursoProximo || !currentDrawDate || !nextDrawDate) {
      throw new ServiceUnavailableException(`Resposta incompleta da CAIXA para ${modalidade}: concurso ou datas inválidos.`);
    }

    const currentCutoffAt = calculateBrazilCutoff(currentDrawDate, horarioCorteLocal);
    const nextCutoffAt = calculateBrazilCutoff(nextDrawDate, horarioCorteLocal);
    const numbers = this.parseDrawnNumbers(payload);
    const prizeTiers = payload.listaRateioPremio ?? [];
    const nextEstimatedPrize = payload.valorEstimadoProximoConcurso ?? payload.valorAcumuladoProximoConcurso ?? null;

    await this.prisma.$transaction(async (tx) => {
      const currentContest = await tx.concurso.upsert({
        where: { modalidade_numeroConcurso: { modalidade, numeroConcurso: payload.numero! } },
        create: {
          modalidade,
          numeroConcurso: payload.numero!,
          dataSorteio: currentDrawDate,
          cutoffAt: currentCutoffAt,
          valorEstimadoPremio: null,
          acumulado: Boolean(payload.acumulado),
          status: numbers.length > 0 ? 'apurado' : 'fechado',
          fonteSincronizacao: 'caixa',
        },
        update: {
          dataSorteio: currentDrawDate,
          cutoffAt: currentCutoffAt,
          acumulado: Boolean(payload.acumulado),
          ...(numbers.length > 0 ? { status: 'apurado' } : {}),
          fonteSincronizacao: 'caixa',
          sincronizadoEm: new Date(),
        },
      });

      if (numbers.length > 0) {
        await tx.resultado.upsert({
          where: { concursoId: currentContest.id },
          create: { concursoId: currentContest.id, numerosSorteados: numbers, listaRateioPremio: prizeTiers as unknown as Prisma.InputJsonValue },
          update: { numerosSorteados: numbers, listaRateioPremio: prizeTiers as unknown as Prisma.InputJsonValue, apuradoEm: new Date() },
        });
      }

      await tx.concurso.upsert({
        where: { modalidade_numeroConcurso: { modalidade, numeroConcurso: payload.numeroConcursoProximo! } },
        create: {
          modalidade,
          numeroConcurso: payload.numeroConcursoProximo!,
          dataSorteio: nextDrawDate,
          cutoffAt: nextCutoffAt,
          valorEstimadoPremio: nextEstimatedPrize,
          acumulado: Boolean(payload.acumulado),
          status: 'aberto',
          fonteSincronizacao: 'caixa',
        },
        update: {
          dataSorteio: nextDrawDate,
          cutoffAt: nextCutoffAt,
          valorEstimadoPremio: nextEstimatedPrize,
          acumulado: Boolean(payload.acumulado),
          fonteSincronizacao: 'caixa',
          sincronizadoEm: new Date(),
        },
      });
    });

    return true;
  }

  private parseDrawnNumbers(payload: CaixaContestPayload): number[] {
    const rawNumbers = payload.dezenasSorteadasOrdemSorteio ?? payload.listaDezenas ?? [];
    const numbers = rawNumbers.map((value) => Number(value));
    if (numbers.some((value) => !Number.isInteger(value) || value < 0)) {
      throw new ServiceUnavailableException('Resposta da CAIXA contém dezenas inválidas.');
    }
    return numbers;
  }

  private async fetchFromCaixa(modalidade: ModalidadeLoteria): Promise<unknown> {
    const base = this.config.get<string>('CAIXA_API_BASE_URL', 'https://servicebus2.caixa.gov.br/portaldeloterias/api').replace(/\/$/, '');
    const configuredTimeout = Number(this.config.get<string>('CAIXA_API_TIMEOUT_MS', '8000'));
    const timeout = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? Math.min(configuredTimeout, 60_000) : 8_000;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`${base}/${modalidade}`, { signal: controller.signal, headers: { accept: 'application/json', 'user-agent': 'BL-Bolao-Livre/0.3' } });
      if (!response.ok) throw new Error(`Caixa respondeu HTTP ${response.status}`);
      return await response.json();
    } catch (error) {
      const message = error instanceof Error ? error.message : 'falha desconhecida';
      throw new ServiceUnavailableException(`Não foi possível sincronizar ${modalidade}: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private assertModalidade(value: string): ModalidadeLoteria {
    if (!MODALIDADES_LOTERIA.includes(value as ModalidadeLoteria)) throw new ServiceUnavailableException('Modalidade de loteria não suportada.');
    return value as ModalidadeLoteria;
  }

  private toPublicContest(contest: { id: string; modalidade: string; numeroConcurso: number; dataSorteio: Date; cutoffAt: Date; valorEstimadoPremio: unknown; acumulado: boolean }) {
    return {
      id: contest.id,
      modalidade: contest.modalidade,
      numeroConcurso: contest.numeroConcurso,
      dataSorteio: contest.dataSorteio,
      cutoffAt: contest.cutoffAt,
      valorEstimadoPremio: contest.valorEstimadoPremio,
      acumulado: contest.acumulado,
    };
  }
}
