import { brazilDayKey } from './festas';

/**
 * Concursos previstos. A CAIXA só informa o "próximo concurso" depois de apurar o anterior. Entre o corte e a publicação
 * do resultado (e sempre que a CAIXA estiver fora do ar) a modalidade ficaria sem nenhum concurso aberto. Para a lista
 * nunca ficar vazia, criamos o concurso seguinte (número + 1) na próxima data de sorteio da modalidade. Quando a CAIXA
 * publicar o concurso de verdade, a sincronização normal sobrescreve data, corte e prêmio.
 */
export const FONTE_PROJETADA = 'projetado';

/** Dias da semana de sorteio (0 = domingo) usados só quando não há histórico nem configuração. */
export const DIAS_SORTEIO_PADRAO: Record<string, number[]> = {
  megasena: [2, 4, 6],
  lotofacil: [1, 2, 3, 4, 5, 6],
  quina: [1, 2, 3, 4, 5, 6],
  lotomania: [1, 3, 5],
  supersete: [1, 3, 5],
  duplasena: [2, 4, 6],
  timemania: [2, 4, 6],
  diadesorte: [2, 4, 6],
};

const HORA_SORTEIO = '20:00';
const DIA_MS = 24 * 60 * 60 * 1000;

/** Dia da semana (0 = domingo) de um dia civil AAAA-MM-DD. */
export function weekdayOfDay(day: string): number {
  return new Date(`${day}T12:00:00-03:00`).getUTCDay();
}

/** Primeiro dia civil depois de `afterDay` cujo dia da semana está em `days`. */
export function nextScheduledDay(afterDay: string, days: number[]): string | null {
  if (days.length === 0) return null;
  let cursor = new Date(`${afterDay}T12:00:00-03:00`).getTime();
  for (let i = 0; i < 8; i += 1) {
    cursor += DIA_MS;
    const key = brazilDayKey(new Date(cursor));
    if (days.includes(weekdayOfDay(key))) return key;
  }
  return null;
}

type ContestRow = { id?: string; numeroConcurso: number; dataSorteio: Date; fonteSincronizacao?: string | null };

/** Parte mínima do cliente Prisma usada aqui (aceita o cliente, uma transação ou um mock). */
export interface UpcomingDb {
  configLoteria: { findMany(args?: unknown): Promise<Array<{ modalidade: string; horarioCorteLocal: string; diasSemanaSorteio?: number[] | null }>> };
  concurso: {
    findFirst(args: unknown): Promise<ContestRow | null>;
    findMany(args: unknown): Promise<ContestRow[]>;
    create(args: { data: Record<string, unknown> }): Promise<unknown>;
  };
}

export interface UpcomingCreated { modalidade: string; numeroConcurso: number; dataSorteio: Date; cutoffAt: Date }

/** Dias de sorteio da modalidade: configuração do painel; senão os dias vistos nos concursos reais das últimas semanas; senão o padrão. */
async function resolveDays(db: UpcomingDb, modalidade: string, configured: number[] | null | undefined, now: Date): Promise<number[]> {
  const fromConfig = (configured ?? []).filter((value) => Number.isInteger(value) && value >= 0 && value <= 6);
  if (fromConfig.length > 0) return fromConfig;
  const since = new Date(now.getTime() - 70 * DIA_MS);
  const rows = await db.concurso.findMany({ where: { modalidade, especial: null, numeroConcurso: { gt: 0 }, dataSorteio: { gte: since } }, select: { dataSorteio: true, fonteSincronizacao: true } });
  const counts = new Map<number, number>();
  for (const row of rows) {
    if (row.fonteSincronizacao === FONTE_PROJETADA) continue;
    const weekday = weekdayOfDay(brazilDayKey(row.dataSorteio));
    counts.set(weekday, (counts.get(weekday) ?? 0) + 1);
  }
  const seen = [...counts.entries()].filter(([, total]) => total >= 3).map(([weekday]) => weekday).sort();
  return seen.length > 0 ? seen : (DIAS_SORTEIO_PADRAO[modalidade] ?? []);
}

/**
 * Garante que toda modalidade tenha um concurso aberto. Só cria quando não existe nenhum aberto (com prazo no futuro)
 * e quando a data prevista ainda dá tempo de vender. Nunca mexe em concurso existente. Devolve o que foi criado.
 */
export async function ensureUpcomingContests(db: UpcomingDb, calculateCutoff: (drawDate: Date, localTime: string) => Date, now: Date = new Date(), horizon: number = 1): Promise<UpcomingCreated[]> {
  const created: UpcomingCreated[] = [];
  const wanted = Math.min(Math.max(Math.trunc(horizon) || 1, 1), 6);
  const configs = await db.configLoteria.findMany();
  for (const config of configs) {
    const modalidade = config.modalidade;
    const opens = await db.concurso.findMany({ where: { modalidade, especial: null, status: 'aberto', cutoffAt: { gt: now } } });
    let missing = wanted - opens.length;
    if (missing <= 0) continue;
    const latest = await db.concurso.findFirst({ where: { modalidade, especial: null, numeroConcurso: { gt: 0 } }, orderBy: { numeroConcurso: 'desc' } });
    if (!latest) continue;
    const days = await resolveDays(db, modalidade, config.diasSemanaSorteio, now);
    let cursor = brazilDayKey(latest.dataSorteio);
    let numeroConcurso = latest.numeroConcurso;
    for (let step = 0; step < 12 && missing > 0; step += 1) {
      const day = nextScheduledDay(cursor, days);
      if (!day) break;
      cursor = day;
      numeroConcurso += 1;
      const drawDate = new Date(`${day}T${HORA_SORTEIO}:00-03:00`);
      const cutoffAt = calculateCutoff(drawDate, config.horarioCorteLocal);
      // Data que já não dá tempo de vender: não inventa concurso a partir de um histórico defasado.
      if (cutoffAt.getTime() <= now.getTime()) break;
      const exists = await db.concurso.findFirst({ where: { modalidade, numeroConcurso } });
      if (exists) break;
      try {
        await db.concurso.create({ data: { modalidade, numeroConcurso, dataSorteio: drawDate, cutoffAt, valorEstimadoPremio: null, acumulado: false, status: 'aberto', fonteSincronizacao: FONTE_PROJETADA } });
      } catch (error) {
        // Outra execução criou o mesmo concurso ao mesmo tempo (chave única): está tudo certo.
        if ((error as { code?: string }).code === 'P2002') break;
        throw error;
      }
      created.push({ modalidade, numeroConcurso, dataSorteio: drawDate, cutoffAt });
      missing -= 1;
    }
  }
  return created;
}

const lastRun = new WeakMap<object, number>();
/** Versão para chamar a cada consulta: no máximo uma vez por minuto por cliente e sem nunca derrubar a consulta. */
export async function ensureUpcomingContestsSoon(db: unknown, calculateCutoff: (drawDate: Date, localTime: string) => Date, everyMs = 60_000): Promise<void> {
  if (!db || typeof db !== 'object') return;
  const now = Date.now();
  if (now - (lastRun.get(db) ?? 0) < everyMs) return;
  lastRun.set(db, now);
  try { await ensureUpcomingContests(db as UpcomingDb, calculateCutoff, new Date(now)); } catch { /* melhor esforço: a lista segue com o que existe */ }
}

/**
 * Sorteios previstos até uma data (sem gravar nada). Serve para a tela de concursos mostrar os próximos meses:
 * continua a contagem a partir do último concurso conhecido, nos dias de sorteio da modalidade. Quem já existe no banco
 * (mesmo número) não entra. Limita a 400 sorteios por modalidade.
 */
export async function projectUpcomingUntil(db: UpcomingDb, calculateCutoff: (drawDate: Date, localTime: string) => Date, until: Date, now: Date = new Date()): Promise<UpcomingCreated[]> {
  const out: UpcomingCreated[] = [];
  const configs = await db.configLoteria.findMany();
  const untilKey = brazilDayKey(until);
  for (const config of configs) {
    const modalidade = config.modalidade;
    const latest = await db.concurso.findFirst({ where: { modalidade, especial: null, numeroConcurso: { gt: 0 } }, orderBy: { numeroConcurso: 'desc' } });
    if (!latest) continue;
    const days = await resolveDays(db, modalidade, config.diasSemanaSorteio, now);
    let cursor = brazilDayKey(latest.dataSorteio);
    let numeroConcurso = latest.numeroConcurso;
    for (let step = 0; step < 400; step += 1) {
      const day = nextScheduledDay(cursor, days);
      if (!day || day > untilKey) break;
      cursor = day;
      numeroConcurso += 1;
      const drawDate = new Date(`${day}T${HORA_SORTEIO}:00-03:00`);
      const cutoffAt = calculateCutoff(drawDate, config.horarioCorteLocal);
      if (cutoffAt.getTime() <= now.getTime()) continue;
      out.push({ modalidade, numeroConcurso, dataSorteio: drawDate, cutoffAt });
    }
  }
  return out;
}
