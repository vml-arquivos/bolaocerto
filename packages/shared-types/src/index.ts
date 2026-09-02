export const MODALIDADES_LOTERIA = [
  'megasena',
  'lotofacil',
  'quina',
  'lotomania',
  'duplasena',
  'timemania',
  'diadesorte',
  'loteca',
  'supersete',
] as const;

export type ModalidadeLoteria = (typeof MODALIDADES_LOTERIA)[number];
export type PapelUsuario = 'cotista' | 'afiliado' | 'admin' | 'operacao';
export type StatusCota = 'reservada' | 'paga' | 'registrada' | 'apurada' | 'premiada' | 'cancelada' | 'estornada';
export type StatusBolao = 'rascunho' | 'aberto' | 'fechado' | 'registrado' | 'apurado' | 'cancelado';

export interface ConcursoPublico {
  id: string;
  modalidade: ModalidadeLoteria;
  numeroConcurso: number;
  dataSorteio: string;
  cutoffAt: string;
  valorEstimadoPremio: string | null;
  acumulado: boolean;
}

export interface BolaoPublico {
  id: string;
  concursoId: string;
  grupoId: string;
  numerosApostados: number[];
  totalCotas: number;
  cotasDisponiveis: number;
  valorCota: string;
  taxaAdministracaoPct: string;
  modeloOperacional: 'mandato' | 'loterica_parceira';
  status: StatusBolao;
  teveGanhador: boolean;
}

export interface CotaPrivada {
  id: string;
  bolaoId: string;
  titularNome: string;
  status: StatusCota;
  valorPago: string | null;
  comprovanteIndividualUrl: string | null;
  faixaPremio?: string | null;
  valorPremio?: string | null;
}

export interface PagamentoCriado {
  id: string;
  status: 'pendente' | 'confirmado' | 'falhou' | 'estornado';
  valorBruto: string;
  valorTaxaAdmin: string;
  valorComissaoAfiliado: string;
  valorCustoBilhete: string;
  qrCodePix: string | null;
  pspTransactionId: string | null;
}

export interface CaixaPrizeTier {
  faixa?: number;
  descricaoFaixa?: string;
  numeroDeGanhadores?: number;
  valorPremio?: number;
}

export interface CaixaContestPayload {
  numero?: number;
  numeroConcursoProximo?: number;
  dataApuracao?: string;
  dataProximoConcurso?: string;
  valorAcumuladoProximoConcurso?: number;
  valorEstimadoProximoConcurso?: number;
  acumulado?: boolean;
  listaDezenas?: string[];
  dezenasSorteadasOrdemSorteio?: string[];
  listaRateioPremio?: CaixaPrizeTier[];
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function optionalFiniteNumber(value: unknown): number | undefined {
  if (typeof value === 'number') return Number.isFinite(value) ? value : undefined;
  if (typeof value !== 'string' || value.trim() === '') return undefined;
  const parsed = Number(value.replace(',', '.'));
  return Number.isFinite(parsed) ? parsed : undefined;
}

function optionalPositiveInteger(value: unknown): number | undefined {
  const parsed = optionalFiniteNumber(value);
  return parsed !== undefined && Number.isInteger(parsed) && parsed > 0 ? parsed : undefined;
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

function optionalStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const result = value.filter((item): item is string => typeof item === 'string' && item.trim() !== '').map((item) => item.trim());
  return result.length > 0 ? result : [];
}

function optionalPrizeTiers(value: unknown): CaixaPrizeTier[] | undefined {
  if (!Array.isArray(value)) return undefined;
  return value.filter(isRecord).map((tier) => ({
    faixa: optionalPositiveInteger(tier.faixa),
    descricaoFaixa: optionalString(tier.descricaoFaixa),
    numeroDeGanhadores: optionalFiniteNumber(tier.numeroDeGanhadores),
    valorPremio: optionalFiniteNumber(tier.valorPremio),
  }));
}

export function normalizeCaixaContestPayload(value: unknown): CaixaContestPayload {
  if (!isRecord(value)) throw new Error('Resposta da CAIXA não é um objeto JSON.');
  return {
    numero: optionalPositiveInteger(value.numero),
    numeroConcursoProximo: optionalPositiveInteger(value.numeroConcursoProximo),
    dataApuracao: optionalString(value.dataApuracao),
    dataProximoConcurso: optionalString(value.dataProximoConcurso),
    valorAcumuladoProximoConcurso: optionalFiniteNumber(value.valorAcumuladoProximoConcurso),
    valorEstimadoProximoConcurso: optionalFiniteNumber(value.valorEstimadoProximoConcurso),
    acumulado: typeof value.acumulado === 'boolean' ? value.acumulado : undefined,
    listaDezenas: optionalStringArray(value.listaDezenas),
    dezenasSorteadasOrdemSorteio: optionalStringArray(value.dezenasSorteadasOrdemSorteio),
    listaRateioPremio: optionalPrizeTiers(value.listaRateioPremio),
  };
}

function validCalendarDate(year: number, month: number, day: number): boolean {
  if (!Number.isInteger(year) || year < 1970 || year > 9999 || !Number.isInteger(month) || month < 1 || month > 12 || !Number.isInteger(day) || day < 1 || day > 31) return false;
  const probe = new Date(Date.UTC(year, month - 1, day));
  return probe.getUTCFullYear() === year && probe.getUTCMonth() === month - 1 && probe.getUTCDate() === day;
}

function validClock(hour: number, minute: number, second: number): boolean {
  return Number.isInteger(hour) && hour >= 0 && hour <= 23 && Number.isInteger(minute) && minute >= 0 && minute <= 59 && Number.isInteger(second) && second >= 0 && second <= 59;
}

function fromBrazilLocalDate(year: number, month: number, day: number, hour = 0, minute = 0, second = 0, millisecond = 0): Date | null {
  if (!validCalendarDate(year, month, day) || !validClock(hour, minute, second) || !Number.isInteger(millisecond) || millisecond < 0 || millisecond > 999) return null;
  // Brazil uses America/Sao_Paulo. Future operation is UTC-03:00; keeping the offset explicit avoids host TZ drift.
  const timestamp = Date.UTC(year, month - 1, day, hour, minute, second, millisecond) + 3 * 60 * 60 * 1000;
  const result = new Date(timestamp);
  return Number.isNaN(result.getTime()) ? null : result;
}

function fromIsoWithOffset(value: string): Date | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})$/.exec(value);
  if (!match) return null;
  const [, yearText, monthText, dayText, hourText, minuteText, secondText = '0', fractionText = '', zone] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = Number(secondText);
  if (!validCalendarDate(year, month, day) || !validClock(hour, minute, second) || !zone) return null;
  const millisecond = Number((fractionText + '000').slice(0, 3));
  const utcWithoutOffset = Date.UTC(year, month - 1, day, hour, minute, second, millisecond);
  let offsetMinutes = 0;
  if (zone !== 'Z') {
    const sign = zone.startsWith('-') ? -1 : 1;
    const zoneParts = /[+-](\d{2}):?(\d{2})/.exec(zone);
    if (!zoneParts) return null;
    const zoneHour = Number(zoneParts[1]);
    const zoneMinute = Number(zoneParts[2]);
    if (zoneHour > 23 || zoneMinute > 59) return null;
    offsetMinutes = sign * (zoneHour * 60 + zoneMinute);
  }
  const result = new Date(utcWithoutOffset - offsetMinutes * 60 * 1000);
  return Number.isNaN(result.getTime()) ? null : result;
}

export function parseCaixaDate(value: unknown): Date | null {
  if (typeof value !== 'string') return null;
  const text = value.trim();
  if (!text) return null;

  const brazilian = /^(\d{2})\/(\d{2})\/(\d{4})(?:\s+(\d{2}):(\d{2})(?::(\d{2}))?)?$/.exec(text);
  if (brazilian) {
    return fromBrazilLocalDate(Number(brazilian[3]), Number(brazilian[2]), Number(brazilian[1]), Number(brazilian[4] ?? 0), Number(brazilian[5] ?? 0), Number(brazilian[6] ?? 0));
  }

  const isoDate = /^(\d{4})-(\d{2})-(\d{2})$/.exec(text);
  if (isoDate) return fromBrazilLocalDate(Number(isoDate[1]), Number(isoDate[2]), Number(isoDate[3]));
  return fromIsoWithOffset(text);
}

function brazilDateParts(value: Date): { year: number; month: number; day: number } {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: 'numeric', day: 'numeric' }).formatToParts(value);
  const values = new Map(parts.map((part) => [part.type, Number(part.value)]));
  return { year: values.get('year') ?? 0, month: values.get('month') ?? 0, day: values.get('day') ?? 0 };
}

export function calculateBrazilCutoff(drawDate: Date, localTime: string): Date {
  if (Number.isNaN(drawDate.getTime())) throw new Error('Data do sorteio inválida.');
  const match = /^(\d{2}):(\d{2})$/.exec(localTime.trim());
  if (!match) throw new Error(`Horário de corte inválido: ${localTime}`);
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (!validClock(hour, minute, 0)) throw new Error(`Horário de corte inválido: ${localTime}`);
  const { year, month, day } = brazilDateParts(drawDate);
  const cutoff = fromBrazilLocalDate(year, month, day, hour, minute, 0);
  if (!cutoff) throw new Error('Não foi possível calcular o corte do concurso.');
  return cutoff;
}
