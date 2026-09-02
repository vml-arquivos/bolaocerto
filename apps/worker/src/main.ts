import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';
import {
  calculateBrazilCutoff,
  CaixaContestPayload,
  CaixaPrizeTier,
  MODALIDADES_LOTERIA,
  normalizeCaixaContestPayload,
  parseCaixaDate,
} from '@bolaocerto/shared-types';

const prisma = new PrismaClient();
const modalities = [...MODALIDADES_LOTERIA];
const baseUrl = (process.env.CAIXA_API_BASE_URL ?? 'https://servicebus2.caixa.gov.br/portaldeloterias/api').replace(/\/$/, '');
const fallbackBase = process.env.CAIXA_FALLBACK_BASE_URL?.replace(/\/$/, '');
const configuredTimeout = Number(process.env.CAIXA_API_TIMEOUT_MS ?? 8000);
const timeoutMs = Number.isFinite(configuredTimeout) && configuredTimeout > 0 ? Math.min(configuredTimeout, 60_000) : 8_000;
const configuredInterval = Number(process.env.WORKER_POLL_MS ?? 300_000);
const intervalMs = Number.isFinite(configuredInterval) && configuredInterval >= 300_000 ? configuredInterval : 300_000;

async function fetchPayload(modality: string): Promise<{ payload: CaixaContestPayload; source: string }> {
  let lastError = 'erro desconhecido';
  for (const [source, origin] of [['caixa', baseUrl], ...(fallbackBase ? [['fallback', fallbackBase] as const] : [])] as const) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(`${origin}/${modality}`, { signal: controller.signal, headers: { accept: 'application/json', 'user-agent': 'BL-Bolao-Livre-worker/0.3' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { payload: normalizeCaixaContestPayload(await response.json()), source };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'erro desconhecido';
    } finally {
      clearTimeout(timer);
    }
  }
  throw new Error(`${modality}: ${lastError}`);
}

function parseDrawnNumbers(payload: CaixaContestPayload): number[] {
  const rawNumbers = payload.dezenasSorteadasOrdemSorteio ?? payload.listaDezenas ?? [];
  const numbers = rawNumbers.map((value) => Number(value));
  if (numbers.some((value) => !Number.isInteger(value) || value < 0)) throw new Error('Resposta da CAIXA contém dezenas inválidas.');
  return numbers;
}

function hitsFor(numbers: number[], drawn: number[]): number {
  const drawnSet = new Set(drawn);
  return numbers.filter((number) => drawnSet.has(number)).length;
}

function findPrizeTier(tiers: CaixaPrizeTier[], hits: number): CaixaPrizeTier | undefined {
  return tiers.find((tier) => {
    const description = (tier.descricaoFaixa ?? '').toLowerCase();
    const numeric = Number(description.match(/\d+/)?.[0] ?? 0);
    return numeric === hits && Number(tier.numeroDeGanhadores ?? 0) > 0 && Number(tier.valorPremio ?? 0) > 0;
  });
}

async function apurarConcurso(concursoId: string, numbers: number[], tiers: CaixaPrizeTier[]): Promise<void> {
  const pools = await prisma.bolao.findMany({ where: { concursoId, status: 'registrado' }, include: { cotas: true } });
  for (const pool of pools) {
    const hits = hitsFor(pool.numerosApostados, numbers);
    const prizeTier = findPrizeTier(tiers, hits);
    await prisma.$transaction(async (tx) => {
      await tx.bolao.update({ where: { id: pool.id }, data: { status: 'apurado', teveGanhador: Boolean(prizeTier) } });
      const totalUnits = pool.cotas.reduce((sum, share) => sum + share.quantidade, 0);
      const unitPrize = prizeTier ? Number(prizeTier.valorPremio ?? 0) / Math.max(totalUnits, 1) : null;
      for (const share of pool.cotas) {
        const status = prizeTier ? 'premiada' : 'apurada';
        const prizeValue = unitPrize === null ? null : unitPrize * share.quantidade;
        await tx.cota.update({ where: { id: share.id }, data: { status, faixaPremio: prizeTier?.descricaoFaixa ?? null, valorPremio: prizeValue } });
        await tx.auditoriaEvento.create({ data: { entidade: 'cota', entidadeId: share.id, evento: prizeTier ? 'cota.premiada' : 'cota.apurada', payloadDepois: { status, faixaPremio: prizeTier?.descricaoFaixa ?? null, valorPremio: prizeValue } } });
        if (prizeTier) await tx.notificacao.create({ data: { usuarioId: share.compradorId, canal: 'push', tipo: 'cota.premiada', payload: { cotaId: share.id, mensagem: 'Você possui uma cota premiada. Acesse sua conta autenticada para consultar os detalhes.' } } });
      }
      await tx.auditoriaEvento.create({ data: { entidade: 'bolao', entidadeId: pool.id, evento: 'resultado.apurado', payloadDepois: { teveGanhador: Boolean(prizeTier), hits } } });
    });
  }
}

async function syncOnce(): Promise<void> {
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
          await tx.resultado.upsert({
            where: { concursoId: currentContest.id },
            create: { concursoId: currentContest.id, numerosSorteados: numbers, listaRateioPremio: prizeTiers as unknown as Prisma.InputJsonValue },
            update: { numerosSorteados: numbers, listaRateioPremio: prizeTiers as unknown as Prisma.InputJsonValue, apuradoEm: new Date() },
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
            status: 'aberto',
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

      if (numbers.length > 0) await apurarConcurso(currentContestId!, numbers, prizeTiers);
      console.log(JSON.stringify({ event: 'concursos.sincronizados', modalidade: modality, numero: payload.numero, proximo: payload.numeroConcursoProximo, fonte: source }));
    } catch (error) {
      console.error(JSON.stringify({ event: 'concursos.sincronizacao_falhou', modalidade: modality, error: error instanceof Error ? error.message : String(error) }));
    }
  }
}

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
