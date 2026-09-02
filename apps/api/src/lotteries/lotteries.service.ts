import { Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { PrismaService } from '../common/prisma.service';
import { MODALIDADES_LOTERIA, ModalidadeLoteria } from '@bolaocerto/shared-types';

interface CaixaContestResponse {
  numero?: number;
  dataApuracao?: string;
  dataProximoConcurso?: string;
  numeroDoConcursoProximo?: number;
  valorAcumuladoProximoConcurso?: number;
  acumulado?: boolean;
  listaDezenas?: string[];
  dezenasSorteadasOrdemSorteio?: string[];
  listaRateioPremio?: Array<{ faixa?: number; descricaoFaixa?: string; numeroDeGanhadores?: number; valorPremio?: number }>;
}

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
      const number = payload.numero;
      if (!number || !payload.dataProximoConcurso) continue;
      const nextDraw = new Date(payload.dataProximoConcurso);
      const cutoffAt = this.calculateCutoff(nextDraw, config.horarioCorteLocal);
      const contest = await this.prisma.concurso.upsert({
        where: { modalidade_numeroConcurso: { modalidade: current, numeroConcurso: number } },
        create: {
          modalidade: current,
          numeroConcurso: number,
          dataSorteio: payload.dataApuracao ? new Date(payload.dataApuracao) : new Date(),
          cutoffAt,
          valorEstimadoPremio: payload.valorAcumuladoProximoConcurso ?? null,
          acumulado: Boolean(payload.acumulado),
          fonteSincronizacao: 'caixa',
        },
        update: {
          dataSorteio: payload.dataApuracao ? new Date(payload.dataApuracao) : undefined,
          cutoffAt,
          valorEstimadoPremio: payload.valorAcumuladoProximoConcurso ?? null,
          acumulado: Boolean(payload.acumulado),
          fonteSincronizacao: 'caixa',
          sincronizadoEm: new Date(),
        },
      });
      const ordered = payload.dezenasSorteadasOrdemSorteio ?? payload.listaDezenas ?? [];
      if (ordered.length > 0) {
        await this.prisma.resultado.upsert({
          where: { concursoId: contest.id },
          create: { concursoId: contest.id, numerosSorteados: ordered.map(Number), listaRateioPremio: payload.listaRateioPremio ?? [] },
          update: { numerosSorteados: ordered.map(Number), listaRateioPremio: payload.listaRateioPremio ?? [], apuradoEm: new Date() },
        });
        await this.prisma.concurso.update({ where: { id: contest.id }, data: { status: 'apurado' } });
      }
      fontes.add('caixa');
      sincronizados += 1;
    }
    return { sincronizados, fontes: [...fontes] };
  }

  private async fetchFromCaixa(modalidade: ModalidadeLoteria): Promise<CaixaContestResponse> {
    const base = this.config.get<string>('CAIXA_API_BASE_URL', 'https://servicebus2.caixa.gov.br/portaldeloterias/api').replace(/\/$/, '');
    const timeout = this.config.get<number>('CAIXA_API_TIMEOUT_MS', 8000);
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(`${base}/${modalidade}`, { signal: controller.signal, headers: { accept: 'application/json', 'user-agent': 'BL-Bolao-Livre/0.2' } });
      if (!response.ok) throw new Error(`Caixa respondeu HTTP ${response.status}`);
      return await response.json() as CaixaContestResponse;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'falha desconhecida';
      throw new ServiceUnavailableException(`Não foi possível sincronizar ${modalidade}: ${message}`);
    } finally {
      clearTimeout(timer);
    }
  }

  private calculateCutoff(drawDate: Date, localTime: string): Date {
    const [hours, minutes] = localTime.split(':').map(Number);
    const cutoff = new Date(drawDate);
    cutoff.setHours(hours || 0, minutes || 0, 0, 0);
    return cutoff;
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
