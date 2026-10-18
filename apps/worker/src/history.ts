import { Prisma, PrismaClient } from '@prisma/client';
import {
  CaixaFetchError,
  CaixaSource,
  CaixaSourceHealth,
  calculateBrazilCutoff,
  fetchCaixaContest,
  getLotteryRule,
  parseHistoricalDraw,
} from '@bolaocerto/shared-types';

export interface HistoryOptions {
  sources: CaixaSource[];
  timeoutMs: number;
  userAgent?: string;
  health: CaixaSourceHealth;
  /** Quantos concursos anteriores manter por modalidade (0 desliga). */
  depth: number;
  /** Máximo de consultas por modalidade a cada ciclo (não sobrecarrega a CAIXA). */
  batch: number;
  /** Pausa entre consultas, em ms. */
  pauseMs: number;
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms));

export function readHistoryOptions(env: NodeJS.ProcessEnv, base: Pick<HistoryOptions, 'sources' | 'timeoutMs' | 'userAgent' | 'health'>): HistoryOptions {
  const number = (value: string | undefined, fallback: number) => { const parsed = Number(value); return Number.isFinite(parsed) && parsed >= 0 ? Math.floor(parsed) : fallback; };
  return { ...base, depth: Math.min(number(env.HISTORY_BACKFILL_DEPTH, 400), 3000), batch: Math.min(number(env.HISTORY_BACKFILL_BATCH, 25), 200), pauseMs: number(env.HISTORY_BACKFILL_PAUSE_MS, 250) };
}

/**
 * Completa o histórico de resultados (concursos já sorteados) usado nas estatísticas.
 * Começa pelos concursos mais recentes e, a cada ciclo, busca no máximo `batch` concursos que ainda faltam.
 */
export async function backfillHistory(prisma: PrismaClient, modality: string, options: HistoryOptions): Promise<{ fetched: number; missing: number }> {
  const rule = getLotteryRule(modality);
  if (!rule || options.depth <= 0 || options.batch <= 0) return { fetched: 0, missing: 0 };
  const config = await prisma.configLoteria.findUnique({ where: { modalidade: modality } });
  if (!config) return { fetched: 0, missing: 0 };

  const latest = await prisma.resultado.findFirst({ where: { concurso: { modalidade: modality } }, orderBy: { concurso: { numeroConcurso: 'desc' } }, select: { concurso: { select: { numeroConcurso: true } } } });
  if (!latest) return { fetched: 0, missing: 0 };
  const newest = latest.concurso.numeroConcurso;
  const oldest = Math.max(1, newest - options.depth + 1);

  const have = await prisma.resultado.findMany({ where: { concurso: { modalidade: modality, numeroConcurso: { gte: oldest, lte: newest } } }, select: { concurso: { select: { numeroConcurso: true } } } });
  const present = new Set(have.map((row) => row.concurso.numeroConcurso));
  const missing: number[] = [];
  for (let n = newest; n >= oldest; n -= 1) if (!present.has(n)) missing.push(n);
  if (missing.length === 0) return { fetched: 0, missing: 0 };

  let fetched = 0;
  let failures = 0;
  for (const contest of missing.slice(0, options.batch)) {
    try {
      const result = await fetchCaixaContest(modality, options.sources, { timeoutMs: options.timeoutMs, retries: 0, userAgent: options.userAgent, health: options.health, contestNumber: contest });
      const draw = parseHistoricalDraw(rule, result.payload, contest);
      if (!draw) { failures += 1; console.error(JSON.stringify({ event: 'historico.resposta_invalida', modalidade: modality, concurso: contest })); if (failures >= 3) break; continue; }
      const cutoffAt = calculateBrazilCutoff(draw.date, config.horarioCorteLocal);
      await prisma.$transaction(async (tx) => {
        const row = await tx.concurso.upsert({
          where: { modalidade_numeroConcurso: { modalidade: modality, numeroConcurso: contest } },
          create: { modalidade: modality, numeroConcurso: contest, dataSorteio: draw.date, cutoffAt, valorEstimadoPremio: null, acumulado: Boolean(result.payload.acumulado), status: 'apurado', fonteSincronizacao: result.source },
          update: { status: 'apurado' },
        });
        const prizes = (result.payload.listaRateioPremio ?? []) as unknown as Prisma.InputJsonValue;
        await tx.resultado.upsert({
          where: { concursoId: row.id },
          create: { concursoId: row.id, numerosSorteados: draw.numbers, numerosSegundoSorteio: draw.secondDrawNumbers, listaRateioPremio: prizes },
          update: { numerosSorteados: draw.numbers, numerosSegundoSorteio: draw.secondDrawNumbers },
        });
      });
      fetched += 1;
      failures = 0;
    } catch (error) {
      failures += 1;
      console.error(JSON.stringify({ event: 'historico.falhou', modalidade: modality, concurso: contest, error: error instanceof Error ? error.message : String(error), ...(error instanceof CaixaFetchError ? { tentativas: error.attempts.length } : {}) }));
      if (failures >= 3) break;
    }
    if (options.pauseMs > 0) await sleep(options.pauseMs);
  }
  if (fetched > 0) console.log(JSON.stringify({ event: 'historico.completado', modalidade: modality, novos: fetched, faltando: Math.max(missing.length - fetched, 0) }));
  return { fetched, missing: missing.length };
}
