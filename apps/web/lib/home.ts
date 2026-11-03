/** Tipos e funções da página inicial (configurada no painel). */
export type HomeSlide = { id: string; tipo: 'bolao' | 'livre'; ativo: boolean; bolaoId?: string; modalidade?: string; etiqueta?: string; imagem?: string; titulo: string; subtitulo?: string; botao?: string; link?: string };
export type HomeSecoes = { numeros: boolean; modalidades: boolean; resultados: boolean; sorteados: boolean; encerrados: boolean; concursos: boolean; comoFunciona: boolean; duvidas: boolean };
export type HomeConfig = { slides: HomeSlide[]; destaques: string[]; secoes: HomeSecoes };
export type ResultDraw = { numeroConcurso: number; dataSorteio: string; numeros: number[]; segundoSorteio: number[]; acumulado: boolean; ganhadores: number | null; premio: number | null; festa: string | null };
export type ResultGroup = { modalidade: string; sorteios: ResultDraw[] };

export const DEFAULT_HOME: HomeConfig = {
  slides: [], destaques: [],
  secoes: { numeros: false, modalidades: true, resultados: true, sorteados: true, encerrados: true, concursos: true, comoFunciona: false, duvidas: true },
};

/** Junta o que veio da API com o padrão (campo que faltar fica no padrão). */
export function withHomeDefaults(value?: Partial<HomeConfig> | null): HomeConfig {
  return { slides: value?.slides ?? [], destaques: value?.destaques ?? [], secoes: { ...DEFAULT_HOME.secoes, ...(value?.secoes ?? {}) } };
}

/**
 * Separa o valor da cota em bilhete + taxa de administração (a mesma conta do sistema:
 * taxa = arredondamento do bilhete × percentual). Devolve null se não fechar com os dados informados.
 */
export function splitQuota(valorCota: number | string, taxaPct: number | string): { bilhete: number; taxa: number; pct: number } | null {
  const quota = Math.round(Number(valorCota) * 100);
  const pct = Number(taxaPct);
  if (!Number.isFinite(quota) || quota <= 0 || !Number.isFinite(pct) || pct < 0) return null;
  const bps = Math.round(pct * 100);
  const guess = Math.round(quota / (1 + bps / 10000));
  for (let ticket = guess - 2; ticket <= guess + 2; ticket += 1) {
    if (ticket > 0 && ticket + Math.round(ticket * bps / 10000) === quota) return { bilhete: ticket / 100, taxa: (quota - ticket) / 100, pct };
  }
  return null;
}

/** Dezena para mostrar na bolinha: "07". */
export const ball = (value: number): string => String(value).padStart(2, '0');

/** Tempo que falta até o sorteio: "2d 03h", "05h 12min", "12min 30s" ou null se já passou. */
export function countdown(target: number, now: number): string | null {
  const diff = target - now;
  if (diff <= 0) return null;
  const sec = Math.floor(diff / 1000);
  const d = Math.floor(sec / 86400); const h = Math.floor((sec % 86400) / 3600); const m = Math.floor((sec % 3600) / 60); const s = sec % 60;
  if (d > 0) return `${d}d ${String(h).padStart(2, '0')}h`;
  if (h > 0) return `${String(h).padStart(2, '0')}h ${String(m).padStart(2, '0')}min`;
  return `${String(m).padStart(2, '0')}min ${String(s).padStart(2, '0')}s`;
}
