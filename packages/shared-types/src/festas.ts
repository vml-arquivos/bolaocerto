/**
 * Concursos de festa (Mega da Virada, Mega do São João, Quina de São João...).
 * Muitas vezes o número oficial só sai perto do sorteio. Até lá o concurso existe com um número provisório
 * NEGATIVO (-AAAAMMDD, pela data do sorteio) e `numeroDefinido = false`. Quando a sincronização com a CAIXA
 * traz o concurso real da mesma data, os bolões passam para o número oficial sem ninguém precisar mexer.
 */
export interface FestaPreset { chave: string; nome: string; modalidade: string }

export const FESTAS_PRESETS: readonly FestaPreset[] = [
  { chave: 'mega-da-virada', nome: 'Mega da Virada', modalidade: 'megasena' },
  { chave: 'mega-sao-joao', nome: 'Mega do São João', modalidade: 'megasena' },
  { chave: 'mega-pascoa', nome: 'Mega de Páscoa', modalidade: 'megasena' },
  { chave: 'mega-independencia', nome: 'Mega da Independência', modalidade: 'megasena' },
  { chave: 'lotofacil-independencia', nome: 'Lotofácil da Independência', modalidade: 'lotofacil' },
  { chave: 'quina-sao-joao', nome: 'Quina de São João', modalidade: 'quina' },
  { chave: 'dupla-pascoa', nome: 'Dupla de Páscoa', modalidade: 'duplasena' },
];

/** Quando a festa acontece: dia (AAAA-MM-DD), hora de Brasília (HH:mm) e se a CAIXA já confirmou. */
export interface FestaSorteio { data: string; hora: string; confirmado: boolean; fonte: string }

/**
 * Datas já conhecidas (calendário da CAIXA). A CAIXA muda dia e horário de tempos em tempos
 * (a Mega da Virada 2026 passou de 31/12 às 20h para 1º/01/2027 às 10h), então o administrador sempre pode ajustar.
 */
export const FESTAS_CALENDARIO: Record<string, readonly FestaSorteio[]> = {
  'mega-da-virada': [{ data: '2027-01-01', hora: '10:00', confirmado: false, fonte: 'Calendário da CAIXA apresentado às lotéricas (aguarda comunicado oficial)' }],
};

const HORA_PADRAO = '20:00';
const FONTE_PREVISAO = 'Previsão pela data tradicional. Confirme no site da CAIXA.';

function pad2(value: number): string { return String(value).padStart(2, '0'); }
function isoDay(year: number, month: number, day: number): string { return `${year}-${pad2(month)}-${pad2(day)}`; }
function weekday(year: number, month: number, day: number): number { return new Date(Date.UTC(year, month - 1, day)).getUTCDay(); }
function shiftDays(year: number, month: number, day: number, delta: number): string {
  const moved = new Date(Date.UTC(year, month - 1, day + delta));
  return isoDay(moved.getUTCFullYear(), moved.getUTCMonth() + 1, moved.getUTCDate());
}
/** Domingo de Páscoa (algoritmo gregoriano). */
export function easterSunday(year: number): { month: number; day: number } {
  const a = year % 19; const b = Math.floor(year / 100); const c = year % 100;
  const d = Math.floor(b / 4); const e = b % 4; const f = Math.floor((b + 8) / 25); const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30; const i = Math.floor(c / 4); const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7; const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); const day = ((h + l - 7 * m + 114) % 31) + 1;
  return { month, day };
}
/** Sábado em ou depois (direcao 1) / em ou antes (direcao -1) do dia indicado. */
function saturdayNear(year: number, month: number, day: number, direction: 1 | -1): string {
  const delta = direction === 1 ? (6 - weekday(year, month, day) + 7) % 7 : -((weekday(year, month, day) + 1) % 7);
  return shiftDays(year, month, day, delta);
}

/** Dia previsto da festa num ano, pela data tradicional (não é confirmação da CAIXA). */
export function previsaoFesta(chave: string, year: number): string | null {
  switch (chave) {
    case 'mega-da-virada': return isoDay(year, 12, 31);
    case 'mega-sao-joao': case 'quina-sao-joao': return saturdayNear(year, 6, 24, 1);
    case 'mega-independencia': case 'lotofacil-independencia': return saturdayNear(year, 9, 7, -1);
    case 'mega-pascoa': case 'dupla-pascoa': { const easter = easterSunday(year); return shiftDays(year, easter.month, easter.day, -1); }
    default: return null;
  }
}

function drawInstant(item: { data: string; hora: string }): number { return new Date(`${item.data}T${item.hora}:00-03:00`).getTime(); }

/** Próximo sorteio da festa (data e hora de Brasília): primeiro o calendário conhecido, depois a previsão tradicional. */
export function proximoSorteioFesta(chave: string, now: Date = new Date()): FestaSorteio | null {
  const known = (FESTAS_CALENDARIO[chave] ?? []).filter((item) => drawInstant(item) > now.getTime()).sort((a, b) => drawInstant(a) - drawInstant(b))[0];
  if (known) return { ...known };
  const startYear = Number(brazilDayKey(now).slice(0, 4));
  for (let year = startYear; year <= startYear + 2; year += 1) {
    const data = previsaoFesta(chave, year);
    if (data && drawInstant({ data, hora: HORA_PADRAO }) > now.getTime()) return { data, hora: HORA_PADRAO, confirmado: false, fonte: FONTE_PREVISAO };
  }
  return null;
}

/** Dia civil em Brasília no formato AAAA-MM-DD. */
export function brazilDayKey(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

/** Número provisório (negativo) de um concurso de festa que ainda não tem número oficial. */
export function provisionalContestNumber(drawDate: Date): number {
  return -Number(brazilDayKey(drawDate).replace(/-/g, ''));
}

/** Rótulo para mostrar o concurso: "Mega da Virada · concurso a definir" ou "Concurso 2980". */
export function contestLabel(contest: { numeroConcurso: number; numeroDefinido?: boolean | null; nomeEspecial?: string | null }): string {
  const defined = contest.numeroDefinido !== false && contest.numeroConcurso > 0;
  if (contest.nomeEspecial) return defined ? `${contest.nomeEspecial} · concurso ${contest.numeroConcurso}` : `${contest.nomeEspecial} · concurso a definir`;
  return defined ? `Concurso ${contest.numeroConcurso}` : 'Concurso a definir';
}

/** Parte mínima do cliente Prisma (ou de uma transação) usada para adotar concursos provisórios. */
export interface FestaTx {
  concurso: {
    findMany(args: { where: Record<string, unknown> }): Promise<Array<{ id: string; dataSorteio: Date; cutoffAt?: Date; especial: string | null; nomeEspecial: string | null }>>;
    findUnique(args: { where: Record<string, unknown> }): Promise<{ id: string; especial: string | null } | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
    delete(args: { where: { id: string } }): Promise<unknown>;
  };
  bolao: { updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }> };
}

/**
 * Se existe um concurso de festa provisório da mesma modalidade e do mesmo dia do concurso oficial `realNumber`,
 * ele passa a ser o oficial. Retorna quantos concursos provisórios foram adotados (0 ou mais).
 * - Se o oficial ainda não existe: o provisório ganha o número oficial.
 * - Se o oficial já existe: os bolões migram para ele, o nome de festa é copiado e o provisório é removido.
 */
export async function adoptProvisionalContests(tx: FestaTx, modalidade: string, realNumber: number, drawDate: Date): Promise<number> {
  if (!Number.isInteger(realNumber) || realNumber <= 0) return 0;
  const day = brazilDayKey(drawDate);
  const candidates = (await tx.concurso.findMany({ where: { modalidade, numeroDefinido: false } })).filter((contest) => brazilDayKey(contest.dataSorteio) === day);
  let adopted = 0;
  for (const provisional of candidates) {
    const real = await tx.concurso.findUnique({ where: { modalidade_numeroConcurso: { modalidade, numeroConcurso: realNumber } } });
    if (!real) {
      await tx.concurso.update({ where: { id: provisional.id }, data: { numeroConcurso: realNumber, numeroDefinido: true } });
    } else {
      await tx.bolao.updateMany({ where: { concursoId: provisional.id }, data: { concursoId: real.id } });
      await tx.concurso.update({ where: { id: real.id }, data: { especial: real.especial ?? provisional.especial, nomeEspecial: provisional.nomeEspecial, numeroDefinido: true, dataSorteio: provisional.dataSorteio, ...(provisional.cutoffAt ? { cutoffAt: provisional.cutoffAt } : {}) } });
      await tx.concurso.delete({ where: { id: provisional.id } });
    }
    adopted += 1;
  }
  return adopted;
}
