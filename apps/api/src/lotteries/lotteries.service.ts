import { BadRequestException, ConflictException, Injectable, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  buildCaixaSources,
  calculateBrazilCutoff,
  CaixaAttempt,
  CaixaContestPayload,
  CaixaFetchError,
  CaixaSourceHealth,
  fetchCaixaContest,
  MODALIDADES_LOTERIA,
  ModalidadeLoteria,
  normalizeCaixaContestPayload,
  parseCaixaDate,
  resolveCaixaTimeout,
} from '@bolaocerto/shared-types';
import { PrismaService } from '../common/prisma.service';
import { CreateManualContestDto } from './lotteries.dto';

@Injectable()
export class LotteriesService {
  private readonly health = new CaixaSourceHealth();

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService) {}

  /**
   * Lista pública. Sem filtro (ou status=aberto) devolve só os concursos realmente abertos (prazo no futuro), do mais próximo
   * para o mais distante. Com outro status devolve o histórico, do mais recente para o mais antigo.
   */
  async list(modalidade?: string, status?: string) {
    const allowed = modalidade ? this.assertModalidade(modalidade) : undefined;
    const openOnly = !status || status === 'aberto';
    const contests = await this.prisma.concurso.findMany({
      where: {
        ...(allowed ? { modalidade: allowed } : {}),
        ...(openOnly ? { status: 'aberto', cutoffAt: { gt: new Date() } } : { status }),
      },
      orderBy: [{ dataSorteio: openOnly ? 'asc' : 'desc' }, { modalidade: 'asc' }],
      take: 100,
    });
    return contests.map((contest) => this.toPublicContest(contest));
  }

  /** Fecha os concursos abertos cujo prazo já passou. Retorna quantos foram fechados. */
  async closeExpired(): Promise<number> {
    const result = await this.prisma.concurso.updateMany({ where: { status: 'aberto', cutoffAt: { lte: new Date() } }, data: { status: 'fechado' } });
    return result.count;
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

  async sync(modalidade?: string): Promise<{ sincronizados: number; fontes: string[]; falhas: Array<{ modalidade: string; erro: string }> }> {
    const modalities = modalidade ? [this.assertModalidade(modalidade)] : [...MODALIDADES_LOTERIA];
    const fontes = new Set<string>();
    const falhas: Array<{ modalidade: string; erro: string }> = [];
    let sincronizados = 0;
    await this.closeExpired();

    for (const current of modalities) {
      const config = await this.prisma.configLoteria.findUnique({ where: { modalidade: current } });
      if (!config) continue;
      try {
        const { payload, source } = await this.fetchFromCaixa(current);
        await this.persistContestPayload(current, config.horarioCorteLocal, payload, source);
        fontes.add(source);
        sincronizados += 1;
      } catch (error) {
        falhas.push({ modalidade: current, erro: error instanceof Error ? error.message : 'falha desconhecida' });
      }
    }

    await this.closeExpired();

    // Uma modalidade com problema não derruba as demais; só falha por inteiro se nada foi sincronizado.
    if (sincronizados === 0 && falhas.length > 0) {
      const first = falhas[0]!;
      throw new ServiceUnavailableException(`Não foi possível sincronizar: ${first.erro}${falhas.length > 1 ? ` (+${falhas.length - 1} modalidade(s) com falha)` : ''}. Use "Testar conexão com a CAIXA" para ver o diagnóstico.`);
    }
    return { sincronizados, fontes: [...fontes], falhas };
  }

  /** Testa a conexão com cada modalidade sem gravar nada. Usado pelo painel do admin. */
  async diagnostics(): Promise<{ fontes: Array<{ tipo: string; url: string }>; timeoutMs: number; resultados: Array<{ modalidade: string; ok: boolean; fonte: string | null; latenciaMs: number; numero: number | null; proximo: number | null; erro: string | null; dica: string | null; tentativas: CaixaAttempt[] }> }> {
    const sources = this.caixaSources();
    const timeoutMs = resolveCaixaTimeout(this.config.get<string>('CAIXA_API_TIMEOUT_MS'));
    const resultados = await Promise.all([...MODALIDADES_LOTERIA].map(async (modalidade) => {
      const started = Date.now();
      try {
        const result = await fetchCaixaContest(modalidade, sources, { timeoutMs, retries: 0, userAgent: this.config.get<string>('CAIXA_USER_AGENT') });
        return { modalidade, ok: true, fonte: result.source, latenciaMs: Date.now() - started, numero: result.payload.numero ?? null, proximo: result.payload.numeroConcursoProximo ?? null, erro: null, dica: null, tentativas: result.attempts };
      } catch (error) {
        const attempts = error instanceof CaixaFetchError ? error.attempts : [];
        const last = [...attempts].reverse().find((attempt) => !attempt.skipped);
        return { modalidade, ok: false, fonte: null, latenciaMs: Date.now() - started, numero: null, proximo: null, erro: last?.error ?? (error instanceof Error ? error.message : 'falha desconhecida'), dica: last?.hint ?? null, tentativas: attempts };
      }
    }));
    return { fontes: sources.map((source) => ({ tipo: source.kind, url: source.template })), timeoutMs, resultados };
  }

  private async persistContestPayload(modalidade: ModalidadeLoteria, horarioCorteLocal: string, rawPayload: unknown, source: string = 'caixa'): Promise<boolean> {
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
          fonteSincronizacao: source,
        },
        update: {
          dataSorteio: currentDrawDate,
          cutoffAt: currentCutoffAt,
          acumulado: Boolean(payload.acumulado),
          ...(numbers.length > 0 ? { status: 'apurado' } : {}),
          fonteSincronizacao: source,
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
          status: nextCutoffAt.getTime() > Date.now() ? 'aberto' : 'fechado',
          fonteSincronizacao: source,
        },
        update: {
          dataSorteio: nextDrawDate,
          cutoffAt: nextCutoffAt,
          valorEstimadoPremio: nextEstimatedPrize,
          acumulado: Boolean(payload.acumulado),
          fonteSincronizacao: source,
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

  private caixaSources() {
    return buildCaixaSources({
      CAIXA_API_BASE_URL: this.config.get<string>('CAIXA_API_BASE_URL'),
      CAIXA_FALLBACK_BASE_URL: this.config.get<string>('CAIXA_FALLBACK_BASE_URL'),
    });
  }

  private async fetchFromCaixa(modalidade: ModalidadeLoteria): Promise<{ payload: CaixaContestPayload; source: string }> {
    const sources = this.caixaSources();
    const timeoutMs = resolveCaixaTimeout(this.config.get<string>('CAIXA_API_TIMEOUT_MS'));
    try {
      const result = await fetchCaixaContest(modalidade, sources, { timeoutMs, retries: 1, userAgent: this.config.get<string>('CAIXA_USER_AGENT'), health: this.health });
      return { payload: result.payload, source: result.source };
    } catch (error) {
      throw new ServiceUnavailableException(error instanceof Error ? error.message : `Não foi possível sincronizar ${modalidade}.`);
    }
  }

  /** Cadastro manual de concurso (contingência quando a API da CAIXA está indisponível). */
  async createManual(dto: CreateManualContestDto) {
    const modalidade = this.assertModalidade(dto.modalidade);
    const config = await this.prisma.configLoteria.findUnique({ where: { modalidade } });
    if (!config) throw new BadRequestException('Modalidade sem configuração cadastrada.');
    const drawDate = new Date(`${dto.dataSorteio}T20:00:00-03:00`);
    if (Number.isNaN(drawDate.getTime())) throw new BadRequestException('Data do sorteio inválida.');
    if (drawDate.getTime() < Date.now()) throw new BadRequestException('A data do sorteio deve ser futura.');
    const exists = await this.prisma.concurso.findUnique({ where: { modalidade_numeroConcurso: { modalidade, numeroConcurso: dto.numeroConcurso } } });
    if (exists) throw new ConflictException('Este concurso já está cadastrado.');
    const contest = await this.prisma.concurso.create({
      data: { modalidade, numeroConcurso: dto.numeroConcurso, dataSorteio: drawDate, cutoffAt: calculateBrazilCutoff(drawDate, config.horarioCorteLocal), acumulado: Boolean(dto.acumulado), status: 'aberto', fonteSincronizacao: 'manual' },
    });
    return this.toPublicContest(contest);
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
