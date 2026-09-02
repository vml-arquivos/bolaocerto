import 'dotenv/config';
import { Prisma, PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const modalities = ['megasena', 'lotofacil', 'quina', 'lotomania', 'duplasena', 'timemania', 'diadesorte', 'loteca', 'supersete'];
const baseUrl = (process.env.CAIXA_API_BASE_URL ?? 'https://servicebus2.caixa.gov.br/portaldeloterias/api').replace(/\/$/, '');
const fallbackBase = process.env.CAIXA_FALLBACK_BASE_URL?.replace(/\/$/, '');
const intervalMs = Number(process.env.WORKER_POLL_MS ?? 300_000);

interface ContestPayload {
  numero?: number;
  dataApuracao?: string;
  dataProximoConcurso?: string;
  valorAcumuladoProximoConcurso?: number;
  acumulado?: boolean;
  listaDezenas?: string[];
  dezenasSorteadasOrdemSorteio?: string[];
  listaRateioPremio?: unknown[];
}

async function fetchPayload(modality: string): Promise<{ payload: ContestPayload; source: string }> {
  let lastError = 'erro desconhecido';
  for (const [source, origin] of [['caixa', baseUrl], ...(fallbackBase ? [['fallback', fallbackBase] as const] : [])] as const) {
    try {
      const response = await fetch(`${origin}/${modality}`, { headers: { accept: 'application/json', 'user-agent': 'BL-Bolao-Livre-worker/0.2' } });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      return { payload: await response.json() as ContestPayload, source };
    } catch (error) {
      lastError = error instanceof Error ? error.message : 'erro desconhecido';
    }
  }
  throw new Error(`${modality}: ${lastError}`);
}

function cutoffFor(draw: Date, localTime: string): Date {
  const [hour, minute] = localTime.split(':').map(Number);
  const cutoff = new Date(draw);
  cutoff.setHours(hour || 0, minute || 0, 0, 0);
  return cutoff;
}

interface PrizeTier { descricaoFaixa?: string; numeroDeGanhadores?: number; valorPremio?: number; }

function hitsFor(numbers: number[], drawn: number[]): number {
  const drawnSet = new Set(drawn);
  return numbers.filter((number) => drawnSet.has(number)).length;
}

function findPrizeTier(tiers: PrizeTier[], hits: number[]): PrizeTier | undefined {
  return tiers.find((tier) => {
    const description = (tier.descricaoFaixa ?? '').toLowerCase();
    const numeric = Number(description.match(/\\d+/)?.[0] ?? 0);
    return numeric === hits.length && Number(tier.numeroDeGanhadores ?? 0) > 0 && Number(tier.valorPremio ?? 0) > 0;
  });
}

async function apurarConcurso(concursoId: string, numbers: number[], tiers: PrizeTier[]): Promise<void> {
  const pools = await prisma.bolao.findMany({ where: { concursoId, status: 'registrado' }, include: { cotas: true } });
  for (const pool of pools) {
    const hits = hitsFor(pool.numerosApostados, numbers);
    const prizeTier = findPrizeTier(tiers, Array.from({ length: hits }, (_, index) => index));
    await prisma.$transaction(async (tx) => {
      await tx.bolao.update({ where: { id: pool.id }, data: { status: 'apurado', teveGanhador: Boolean(prizeTier) } });
      const totalUnits = pool.cotas.reduce((sum, share) => sum + share.quantidade, 0);
      const unitPrize = prizeTier ? Number(prizeTier.valorPremio ?? 0) / Math.max(totalUnits, 1) : null;
      for (const share of pool.cotas) {
        const status = prizeTier ? 'premiada' : 'apurada';
        await tx.cota.update({ where: { id: share.id }, data: { status, faixaPremio: prizeTier?.descricaoFaixa ?? null, valorPremio: unitPrize === null ? null : unitPrize * share.quantidade } });
        await tx.auditoriaEvento.create({ data: { entidade: 'cota', entidadeId: share.id, evento: prizeTier ? 'cota.premiada' : 'cota.apurada', payloadDepois: { status, faixaPremio: prizeTier?.descricaoFaixa ?? null, valorPremio: unitPrize === null ? null : unitPrize * share.quantidade } } });
        if (prizeTier) await tx.notificacao.create({ data: { usuarioId: share.compradorId, canal: 'push', tipo: 'cota.premiada', payload: { cotaId: share.id, mensagem: 'Você possui uma cota premiada. Acesse sua conta autenticada para consultar os detalhes.' } } });
      }
      await tx.auditoriaEvento.create({ data: { entidade: 'bolao', entidadeId: pool.id, evento: 'resultado.apurado', payloadDepois: { teveGanhador: Boolean(prizeTier), hits } } });
    });
  }
}

async function syncOnce(): Promise<void> {
  for (const modality of modalities) {
    const config = await prisma.configLoteria.findUnique({ where: { modalidade: modality } });
    if (!config) continue;
    try {
      const { payload, source } = await fetchPayload(modality);
      if (!payload.numero || !payload.dataProximoConcurso) continue;
      const drawDate = payload.dataApuracao ? new Date(payload.dataApuracao) : new Date();
      const nextContest = await prisma.concurso.upsert({
        where: { modalidade_numeroConcurso: { modalidade: modality, numeroConcurso: payload.numero } },
        create: { modalidade: modality, numeroConcurso: payload.numero, dataSorteio: drawDate, cutoffAt: cutoffFor(new Date(payload.dataProximoConcurso), config.horarioCorteLocal), valorEstimadoPremio: payload.valorAcumuladoProximoConcurso ?? null, acumulado: Boolean(payload.acumulado), fonteSincronizacao: source },
        update: { dataSorteio: drawDate, cutoffAt: cutoffFor(new Date(payload.dataProximoConcurso), config.horarioCorteLocal), valorEstimadoPremio: payload.valorAcumuladoProximoConcurso ?? null, acumulado: Boolean(payload.acumulado), fonteSincronizacao: source, sincronizadoEm: new Date() },
      });
      const numbers = payload.dezenasSorteadasOrdemSorteio ?? payload.listaDezenas ?? [];
      if (numbers.length) {
        await prisma.resultado.upsert({ where: { concursoId: nextContest.id }, create: { concursoId: nextContest.id, numerosSorteados: numbers.map(Number), listaRateioPremio: (payload.listaRateioPremio ?? []) as Prisma.InputJsonValue }, update: { numerosSorteados: numbers.map(Number), listaRateioPremio: (payload.listaRateioPremio ?? []) as Prisma.InputJsonValue, apuradoEm: new Date() } });
        await apurarConcurso(nextContest.id, numbers.map(Number), (payload.listaRateioPremio ?? []) as PrizeTier[]);
      }
      console.log(JSON.stringify({ event: 'concursos.sincronizados', modalidade: modality, numero: payload.numero, fonte: source }));
    } catch (error) {
      console.error(JSON.stringify({ event: 'concursos.sincronizacao_falhou', modalidade: modality, error: error instanceof Error ? error.message : String(error) }));
    }
  }
}

void syncOnce().then(() => setInterval(() => void syncOnce(), intervalMs));

process.once('SIGTERM', async () => {
  await prisma.$disconnect();
  process.exit(0);
});
