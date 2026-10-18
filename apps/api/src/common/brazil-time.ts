/** Utilitários de data no fuso de Brasília (sem horário de verão desde 2019). */
const formatter = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' });

/** Data civil (AAAA-MM-DD) em Brasília. */
export function brazilDate(date: Date = new Date()): string {
  return formatter.format(date);
}

/** Soma dias a uma data civil AAAA-MM-DD. */
export function addDaysToDate(date: string, days: number): string {
  const [year = 1970, month = 1, day = 1] = date.split('-').map(Number);
  const result = new Date(Date.UTC(year, month - 1, day + days));
  return result.toISOString().slice(0, 10);
}

/** Último instante do dia civil informado, em Brasília. */
export function endOfBrazilDay(date: string): Date {
  return new Date(`${date}T23:59:59.999-03:00`);
}

export function round2(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
