/** Configuração da página inicial, definida pelo administrador no painel. */
export const HOME_CONFIG_KEY = 'home.config';
export const MAX_SLIDES = 8;
export const MAX_DESTAQUES = 6;
export const HOME_IMAGE_PREFIX = 'home.img.';
export const HOME_IMAGE_URL = '/api/v1/home/imagem/';
export const MAX_IMAGE_BYTES = 1_500_000;

export interface HomeSlide {
  id: string;
  tipo: 'bolao' | 'livre';
  ativo: boolean;
  bolaoId?: string;
  modalidade?: string;
  etiqueta?: string;
  imagem?: string;
  titulo: string;
  subtitulo?: string;
  botao?: string;
  link?: string;
}
export interface HomeSecoes {
  numeros: boolean;
  modalidades: boolean;
  resultados: boolean;
  sorteados: boolean;
  encerrados: boolean;
  concursos: boolean;
  comoFunciona: boolean;
  duvidas: boolean;
}
export interface HomeConfig { slides: HomeSlide[]; destaques: string[]; secoes: HomeSecoes }

/** Página inicial enxuta por padrão; o administrador liga o que quiser. */
export const DEFAULT_SECOES: HomeSecoes = { numeros: false, modalidades: true, resultados: true, sorteados: true, encerrados: true, concursos: true, comoFunciona: false, duvidas: true };
export const DEFAULT_HOME: HomeConfig = { slides: [], destaques: [], secoes: { ...DEFAULT_SECOES } };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
/** Só caminhos do próprio site ou endereços https. Nunca javascript:, data: nem //outro-site. */
export function isSafeLink(value: string): boolean { return /^\/(?!\/)[^\s]*$/.test(value) || /^https:\/\/[^\s]+$/i.test(value); }

const text = (value: unknown, max: number): string => (typeof value === 'string' ? value.trim().slice(0, max) : '');

/** Lê o que está salvo (JSON de texto) e devolve uma configuração válida, descartando o que estiver estragado. */
export function normalizeHomeConfig(raw: unknown): HomeConfig {
  let data: any = raw;
  if (typeof raw === 'string') { try { data = JSON.parse(raw); } catch { data = null; } }
  if (!data || typeof data !== 'object') return { slides: [], destaques: [], secoes: { ...DEFAULT_SECOES } };
  const slides: HomeSlide[] = [];
  for (const item of Array.isArray(data.slides) ? data.slides.slice(0, MAX_SLIDES) : []) {
    if (!item || typeof item !== 'object') continue;
    const tipo = item.tipo === 'bolao' ? 'bolao' : 'livre';
    const bolaoId = typeof item.bolaoId === 'string' && UUID.test(item.bolaoId) ? item.bolaoId : undefined;
    if (tipo === 'bolao' && !bolaoId) continue;
    const titulo = text(item.titulo, 80);
    if (tipo === 'livre' && !titulo) continue;
    const link = text(item.link, 200);
    slides.push({
      id: text(item.id, 40) || `s${slides.length + 1}`, tipo, ativo: item.ativo !== false,
      ...(bolaoId ? { bolaoId } : {}), ...(text(item.modalidade, 30) ? { modalidade: text(item.modalidade, 30) } : {}),
      titulo, ...(text(item.etiqueta, 40) ? { etiqueta: text(item.etiqueta, 40) } : {}), ...(text(item.imagem, 200) && isSafeLink(text(item.imagem, 200)) ? { imagem: text(item.imagem, 200) } : {}), ...(text(item.subtitulo, 200) ? { subtitulo: text(item.subtitulo, 200) } : {}),
      ...(text(item.botao, 30) ? { botao: text(item.botao, 30) } : {}), ...(link && isSafeLink(link) ? { link } : {}),
    });
  }
  const destaques = (Array.isArray(data.destaques) ? data.destaques : []).filter((id: unknown): id is string => typeof id === 'string' && UUID.test(id)).filter((id: string, index: number, all: string[]) => all.indexOf(id) === index).slice(0, MAX_DESTAQUES);
  const secoes = { ...DEFAULT_SECOES };
  if (data.secoes && typeof data.secoes === 'object') for (const key of Object.keys(DEFAULT_SECOES) as Array<keyof HomeSecoes>) if (typeof data.secoes[key] === 'boolean') secoes[key] = data.secoes[key];
  return { slides, destaques, secoes };
}
