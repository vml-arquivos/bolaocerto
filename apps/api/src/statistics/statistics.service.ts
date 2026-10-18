import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma } from '@prisma/client';
import {
  analyzeGame,
  buildCaixaSources,
  calculateBrazilCutoff,
  CaixaSourceHealth,
  computeStats,
  equivalentSimpleGames,
  fetchCaixaContest,
  getLotteryRule,
  HistoricalDraw,
  LotteryRule,
  LotteryStats,
  parseHistoricalDraw,
  resolveCaixaTimeout,
  STATS_DISCLAIMER,
  suggestGames,
  supportedStatisticsModalities,
  tierProbabilities,
} from '@bolaocerto/shared-types';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { AnalyzeGameDto, ProbabilityQueryDto, StatsQueryDto, SuggestQueryDto } from './statistics.dto';

const CACHE_TTL_MS = 5 * 60_000;
const HISTORY_LIMIT = 1500;

interface Dataset { draws: HistoricalDraw[]; contests: number; lastContest: number | null; loadedAt: number }

export function parseNumberList(value: string | undefined): number[] {
  return (value ?? '').split(/[ ,]+/).map((item) => item.trim()).filter(Boolean).map(Number).filter((item) => Number.isInteger(item) && item >= 0);
}

@Injectable()
export class StatisticsService {
  private readonly cache = new Map<string, Dataset>();
  private readonly health = new CaixaSourceHealth();

  constructor(private readonly prisma: PrismaService, private readonly config: ConfigService, private readonly audit: AuditService) {}

  private ruleOrThrow(modalidade: string): LotteryRule {
    const rule = getLotteryRule(modalidade);
    if (!rule) throw new NotFoundException(`Não há estatísticas de dezenas para "${modalidade}". Disponíveis: ${supportedStatisticsModalities().join(', ')}.`);
    return rule;
  }

  /** Carrega o histórico (do mais antigo ao mais recente). Dupla Sena entra com os dois sorteios de cada concurso. */
  private async dataset(rule: LotteryRule): Promise<Dataset> {
    const cached = this.cache.get(rule.modalidade);
    if (cached && Date.now() - cached.loadedAt < CACHE_TTL_MS) return cached;
    const rows = await this.prisma.resultado.findMany({
      where: { concurso: { modalidade: rule.modalidade } },
      orderBy: { concurso: { numeroConcurso: 'desc' } },
      take: HISTORY_LIMIT,
      select: { numerosSorteados: true, numerosSegundoSorteio: true, concurso: { select: { numeroConcurso: true, dataSorteio: true } } },
    });
    const draws: HistoricalDraw[] = [];
    for (const row of [...rows].reverse()) {
      const date = row.concurso.dataSorteio.toISOString().slice(0, 10);
      if (row.numerosSorteados.length > 0) draws.push({ contest: row.concurso.numeroConcurso, date, numbers: row.numerosSorteados });
      if (rule.secondDraw && row.numerosSegundoSorteio.length > 0) draws.push({ contest: row.concurso.numeroConcurso, date, numbers: row.numerosSegundoSorteio });
    }
    const dataset: Dataset = { draws, contests: rows.length, lastContest: rows[0]?.concurso.numeroConcurso ?? null, loadedAt: Date.now() };
    this.cache.set(rule.modalidade, dataset);
    return dataset;
  }

  invalidate(modalidade?: string): void {
    if (modalidade) this.cache.delete(modalidade); else this.cache.clear();
  }

  async overview() {
    const items = await Promise.all(supportedStatisticsModalities().map(async (modalidade) => {
      const rule = getLotteryRule(modalidade)!;
      const data = await this.dataset(rule);
      const top = tierProbabilities(rule, rule.betMin)[0]!;
      const last = data.draws[data.draws.length - 1];
      return {
        modalidade, nome: rule.nome, concursosNaBase: data.contests, ultimoConcurso: data.lastContest, ultimaData: last?.date ?? null,
        ultimasDezenas: last?.numbers ?? [], universo: { min: rule.min, max: rule.max }, dezenasSorteadas: rule.draw,
        jogoMinimo: rule.betMin, jogoMaximo: rule.betMax, chancePremioMaximo: { umEm: top.oneIn, rotulo: top.label },
      };
    }));
    return { modalidades: items, aviso: STATS_DISCLAIMER };
  }

  async modality(modalidade: string, query: StatsQueryDto = {}) {
    const rule = this.ruleOrThrow(modalidade);
    const data = await this.dataset(rule);
    const stats: LotteryStats = computeStats(rule, data.draws, { recentWindow: query.janela });
    const recent = await this.prisma.resultado.findMany({
      where: { concurso: { modalidade } }, orderBy: { concurso: { numeroConcurso: 'desc' } }, take: 10,
      select: { numerosSorteados: true, numerosSegundoSorteio: true, listaRateioPremio: true, concurso: { select: { numeroConcurso: true, dataSorteio: true, acumulado: true } } },
    });
    const next = await this.prisma.concurso.findFirst({ where: { modalidade, status: 'aberto' }, orderBy: { numeroConcurso: 'asc' }, select: { numeroConcurso: true, dataSorteio: true, valorEstimadoPremio: true, acumulado: true } });
    return {
      ...stats,
      concursosNaBase: data.contests,
      ultimosResultados: recent.map((row) => ({ concurso: row.concurso.numeroConcurso, data: row.concurso.dataSorteio, acumulado: row.concurso.acumulado, dezenas: row.numerosSorteados, segundoSorteio: row.numerosSegundoSorteio })),
      proximoConcurso: next ? { concurso: next.numeroConcurso, data: next.dataSorteio, premioEstimado: next.valorEstimadoPremio ? Number(next.valorEstimadoPremio) : null, acumulado: next.acumulado } : null,
      probabilidades: this.probabilities(modalidade, {}),
    };
  }

  probabilities(modalidade: string, query: ProbabilityQueryDto) {
    const rule = this.ruleOrThrow(modalidade);
    const size = query.dezenas ?? rule.betMin;
    if (size < rule.betMin || size > rule.betMax) throw new BadRequestException(`${rule.nome}: o jogo tem de ${rule.betMin} a ${rule.betMax} dezenas.`);
    const sizes: number[] = [];
    for (let k = rule.betMin; k <= rule.betMax && sizes.length < 8; k += 1) sizes.push(k);
    return {
      modalidade, nome: rule.nome, dezenas: size, jogosSimplesEquivalentes: equivalentSimpleGames(rule, size),
      faixas: tierProbabilities(rule, size),
      porTamanho: sizes.map((k) => ({ dezenas: k, jogosSimplesEquivalentes: equivalentSimpleGames(rule, k), premioMaximo: tierProbabilities(rule, k)[0] })),
      explicacao: `Com ${size} dezenas marcadas num universo de ${rule.max - rule.min + 1} números, a chance é calculada pela distribuição hipergeométrica (combinações exatas). Todas as combinações do mesmo tamanho têm a mesma chance.`,
      aviso: STATS_DISCLAIMER,
    };
  }

  async analyze(modalidade: string, dto: AnalyzeGameDto) {
    const rule = this.ruleOrThrow(modalidade);
    const data = await this.dataset(rule);
    const analysis = analyzeGame(rule, data.draws, dto.numeros);
    if (!analysis.valid) throw new BadRequestException(analysis.errors.join(' '));
    return { modalidade, nome: rule.nome, ...analysis };
  }

  async suggest(modalidade: string, query: SuggestQueryDto) {
    const rule = this.ruleOrThrow(modalidade);
    const data = await this.dataset(rule);
    const size = query.dezenas ?? rule.betMin;
    if (size < rule.betMin || size > rule.betMax) throw new BadRequestException(`${rule.nome}: o jogo tem de ${rule.betMin} a ${rule.betMax} dezenas.`);
    const fixed = parseNumberList(query.fixos);
    if (fixed.length > size) throw new BadRequestException('Há mais números fixos do que o tamanho do jogo.');
    if (fixed.some((value) => value < rule.min || value > rule.max)) throw new BadRequestException(`Os números fixos devem estar entre ${rule.min} e ${rule.max}.`);
    const result = suggestGames(rule, data.draws, { games: query.jogos ?? 3, size, strategy: query.estrategia ?? 'equilibrado', fixed, exclude: parseNumberList(query.excluir) });
    return { modalidade, nome: rule.nome, baseHistorica: data.draws.length, ...result };
  }

  /**
   * Importa agora (até `limit` concursos por modalidade) o histórico que o worker ainda não completou.
   * Usa as mesmas fontes da sincronização (CAIXA e espelhos).
   */
  async importHistory(modalidade: string | undefined, limit: number, adminId: string) {
    const targets = modalidade ? [this.ruleOrThrow(modalidade).modalidade] : supportedStatisticsModalities();
    const sources = buildCaixaSources(process.env);
    const timeoutMs = resolveCaixaTimeout(this.config.get<string>('CAIXA_API_TIMEOUT_MS'));
    const depth = Math.min(Number(this.config.get('HISTORY_BACKFILL_DEPTH') ?? 400) || 400, 3000);
    const report: Array<{ modalidade: string; importados: number; faltando: number; erro?: string }> = [];
    for (const target of targets) {
      const rule = getLotteryRule(target)!;
      let importados = 0;
      let faltando = 0;
      let erro: string | undefined;
      try {
        const config = await this.prisma.configLoteria.findUnique({ where: { modalidade: target } });
        const latest = await this.prisma.resultado.findFirst({ where: { concurso: { modalidade: target } }, orderBy: { concurso: { numeroConcurso: 'desc' } }, select: { concurso: { select: { numeroConcurso: true } } } });
        if (!config || !latest) { report.push({ modalidade: target, importados: 0, faltando: 0, erro: 'Ainda não há nenhum resultado sincronizado desta modalidade. Rode "Sincronizar com a CAIXA" primeiro.' }); continue; }
        const newest = latest.concurso.numeroConcurso;
        const oldest = Math.max(1, newest - depth + 1);
        const have = await this.prisma.resultado.findMany({ where: { concurso: { modalidade: target, numeroConcurso: { gte: oldest, lte: newest } } }, select: { concurso: { select: { numeroConcurso: true } } } });
        const present = new Set(have.map((row) => row.concurso.numeroConcurso));
        const missing: number[] = [];
        for (let n = newest; n >= oldest; n -= 1) if (!present.has(n)) missing.push(n);
        faltando = missing.length;
        let failures = 0;
        for (const contest of missing.slice(0, limit)) {
          try {
            const fetched = await fetchCaixaContest(target, sources, { timeoutMs, retries: 0, userAgent: this.config.get<string>('CAIXA_USER_AGENT'), health: this.health, contestNumber: contest });
            const draw = parseHistoricalDraw(rule, fetched.payload, contest);
            if (!draw) { failures += 1; if (failures >= 3) { erro = 'A fonte respondeu com dados inválidos ou de outro concurso.'; break; } continue; }
            const cutoffAt = calculateBrazilCutoff(draw.date, config.horarioCorteLocal);
            await this.prisma.$transaction(async (tx) => {
              const row = await tx.concurso.upsert({
                where: { modalidade_numeroConcurso: { modalidade: target, numeroConcurso: contest } },
                create: { modalidade: target, numeroConcurso: contest, dataSorteio: draw.date, cutoffAt, valorEstimadoPremio: null, acumulado: Boolean(fetched.payload.acumulado), status: 'apurado', fonteSincronizacao: fetched.source },
                update: { status: 'apurado' },
              });
              await tx.resultado.upsert({
                where: { concursoId: row.id },
                create: { concursoId: row.id, numerosSorteados: draw.numbers, numerosSegundoSorteio: draw.secondDrawNumbers, listaRateioPremio: (fetched.payload.listaRateioPremio ?? []) as unknown as Prisma.InputJsonValue },
                update: { numerosSorteados: draw.numbers, numerosSegundoSorteio: draw.secondDrawNumbers },
              });
            });
            importados += 1;
            failures = 0;
          } catch (error) {
            failures += 1;
            erro = error instanceof Error ? error.message : String(error);
            if (failures >= 3) break;
          }
        }
        faltando = Math.max(faltando - importados, 0);
      } catch (error) {
        erro = error instanceof Error ? error.message : String(error);
      }
      report.push({ modalidade: target, importados, faltando, ...(erro ? { erro } : {}) });
    }
    this.invalidate();
    await this.prisma.$transaction(async (tx) => {
      await this.audit.record(tx, { entidade: 'estatisticas', entidadeId: adminId, evento: 'estatisticas.historico_importado', atorId: adminId, payloadDepois: { relatorio: report } as unknown as Prisma.InputJsonValue });
    });
    return { relatorio: report };
  }
}
