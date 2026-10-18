import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  buildCaixaSources,
  calculateBrazilCutoff,
  CaixaContestPayload,
  CaixaFetchError,
  CaixaPrizeTier,
  CaixaSourceHealth,
  fetchCaixaContest,
  MODALIDADES_LOTERIA,
  parseCaixaDate,
  resolveCaixaTimeout,
} from '@bolaocerto/shared-types';
import { sendAlert } from './alert';
import { backfillHistory, readHistoryOptions } from './history';
import { apurarConcurso } from './settle';

const prisma = new PrismaClient();
const modalities = [...MODALIDADES_LOTERIA];
const sources = buildCaixaSources(process.env);
const timeoutMs = resolveCaixaTimeout(process.env.CAIXA_API_TIMEOUT_MS);
const sourceHealth = new CaixaSourceHealth();
const historyOptions = readHistoryOptions(process.env, { sources, timeoutMs, userAgent: process.env.CAIXA_USER_AGENT, health: sourceHealth });
const configuredInterval = Number(process.env.WORKER_POLL_MS ?? 300_000);
const intervalMs = Number.isFinite(configuredInterval) && configuredInterval >= 300_000 ? configuredInterval : 300_000;

async function fetchPayload(modality: string): Promise<{ payload: CaixaContestPayload; source: string }> {
  const result = await fetchCaixaContest(modality, sources, { timeoutMs, retries: 1, userAgent: process.env.CAIXA_USER_AGENT, health: sourceHealth });
  return { payload: result.payload, source: result.source };
}

function parseDrawnNumbers(payload: CaixaContestPayload): number[] {
  const rawNumbers = payload.dezenasSorteadasOrdemSorteio ?? payload.listaDezenas ?? [];
  const numbers = rawNumbers.map((value) => Number(value));
  if (numbers.some((value) => !Number.isInteger(value) || value < 0)) throw new Error('Resposta da CAIXA contém dezenas inválidas.');
  return numbers;
}

/** Concursos cujo prazo (cutoff) já passou nunca ficam "abertos", mesmo que a CAIXA esteja fora do ar. */
async function closeExpiredContests(): Promise<void> {
  try {
    const closed = await prisma.concurso.updateMany({ where: { status: 'aberto', cutoffAt: { lte: new Date() } }, data: { status: 'fechado' } });
    if (closed.count > 0) console.log(JSON.stringify({ event: 'concursos.vencidos_fechados', total: closed.count }));
  } catch (error) {
    console.error(JSON.stringify({ event: 'concursos.fechamento_falhou', error: error instanceof Error ? error.message : String(error) }));
  }
}

async function syncOnce(): Promise<void> {
  await closeExpiredContests();
  let failed = 0;
  for (const modality of modalities) {
    try {
      const config = await prisma.configLoteria.findUnique({ where: { modalidade: modality } });
      if (!config) continue;
      const { payload, source } = await fetchPayload(modality);
      if (!payload.numero || !payload.numeroConcursoProximo) throw new Error('Resposta sem numero ou numeroConcursoProximo.');
      const currentNumber = payload.numero;
      const nextNumber = payload.numeroConcursoProximo;
      const currentDrawDate = parseCaixaDate(payload.dataApuracao);
      const nextDrawDate = parseCaixaDate(payload.dataProximoConcurso);
      if (!currentDrawDate || !nextDrawDate) throw new Error('Resposta com dataApuracao ou dataProximoConcurso inválida.');
      const currentCutoffAt = calculateBrazilCutoff(currentDrawDate, config.horarioCorteLocal);
      const nextCutoffAt = calculateBrazilCutoff(nextDrawDate, config.horarioCorteLocal);
      const numbers = parseDrawnNumbers(payload);
      const prizeTiers = payload.listaRateioPremio ?? [];
      const nextEstimatedPrize = payload.valorEstimadoProximoConcurso ?? payload.valorAcumuladoProximoConcurso ?? null;

      let currentContestId: string;
      await prisma.$transaction(async (tx) => {
        const currentContest = await tx.concurso.upsert({
          where: { modalidade_numeroConcurso: { modalidade: modality, numeroConcurso: currentNumber } },
          create: {
            modalidade: modality,
            numeroConcurso: currentNumber,
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
            valorEstimadoPremio: null,
            acumulado: Boolean(payload.acumulado),
            ...(numbers.length > 0 ? { status: 'apurado' } : {}),
            fonteSincronizacao: source,
            sincronizadoEm: new Date(),
          },
        });
        currentContestId = currentContest.id;

        if (numbers.length > 0) {
          const secondDraw = modality === 'duplasena' ? (payload.listaDezenasSegundoSorteio ?? []).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0) : [];
          await tx.resultado.upsert({
            where: { concursoId: currentContest.id },
            create: { concursoId: currentContest.id, numerosSorteados: numbers, numerosSegundoSorteio: secondDraw, listaRateioPremio: prizeTiers as unknown as Prisma.InputJsonValue },
            update: { numerosSorteados: numbers, numerosSegundoSorteio: secondDraw, listaRateioPremio: prizeTiers as unknown as Prisma.InputJsonValue, apuradoEm: new Date() },
          });
        }

        await tx.concurso.upsert({
          where: { modalidade_numeroConcurso: { modalidade: modality, numeroConcurso: nextNumber } },
          create: {
            modalidade: modality,
            numeroConcurso: nextNumber,
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

      if (numbers.length > 0) {
        const secondDraw = modality === 'duplasena' ? (payload.listaDezenasSegundoSorteio ?? []).map((value) => Number(value)).filter((value) => Number.isInteger(value) && value >= 0) : [];
        await apurarConcurso(prisma, currentContestId!, modality, currentNumber, numbers, secondDraw, prizeTiers);
      }
      console.log(JSON.stringify({ event: 'concursos.sincronizados', modalidade: modality, numero: payload.numero, proximo: payload.numeroConcursoProximo, fonte: source }));
    } catch (error) {
      failed += 1;
      console.error(JSON.stringify({
        event: 'concursos.sincronizacao_falhou',
        modalidade: modality,
        error: error instanceof Error ? error.message : String(error),
        ...(error instanceof CaixaFetchError ? { tentativas: error.attempts.map((attempt) => ({ fonte: attempt.source, status: attempt.status, codigo: attempt.code, erro: attempt.error, ms: attempt.latencyMs, pulada: attempt.skipped })) } : {}),
      }));
    }
  }
  await closeExpiredContests();
  if (failed > 0 && failed === modalities.length) await sendAlert('caixa-falha-total', 'Todas as sincronizações com a CAIXA falharam neste ciclo. Veja o diagnóstico no painel admin.', 2 * 3_600_000);
  await syncHistory();
}

/** Completa aos poucos o histórico usado nas estatísticas. Falhas aqui nunca interrompem a sincronização principal. */
async function syncHistory(): Promise<void> {
  for (const modality of modalities) {
    try {
      await backfillHistory(prisma, modality, historyOptions);
    } catch (error) {
      console.error(JSON.stringify({ event: 'historico.erro', modalidade: modality, error: error instanceof Error ? error.message : String(error) }));
    }
  }
}

console.log(JSON.stringify({ event: 'worker.iniciado', fontes: sources.map((source) => ({ tipo: source.kind, url: source.template })), timeoutMs, intervaloMs: intervalMs, historico: { profundidade: historyOptions.depth, lote: historyOptions.batch } }));

let running = false;
let shuttingDown = false;
const timer = setInterval(() => {
  if (shuttingDown || running) return;
  running = true;
  void syncOnce().catch((error) => console.error(JSON.stringify({ event: 'worker.falhou', error: error instanceof Error ? error.message : String(error) }))).finally(() => { running = false; });
}, intervalMs);

running = true;
void syncOnce().catch((error) => console.error(JSON.stringify({ event: 'worker.falhou', error: error instanceof Error ? error.message : String(error) }))).finally(() => { running = false; });

async function shutdown(): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  clearInterval(timer);
  await prisma.$disconnect();
  process.exit(0);
}

process.once('SIGTERM', () => { void shutdown(); });
process.once('SIGINT', () => { void shutdown(); });
