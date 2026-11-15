import { ConflictException } from '@nestjs/common';

/**
 * Regras dos afiliados: nível (Bronze, Prata, Ouro, Diamante) com o máximo de cotas por bolão e o valor máximo da cota,
 * limite manual autorizado pelo administrador para um afiliado específico e o teto da comissão (travado em 35% por padrão).
 * Tudo fica em configuracoes_sistema (sem migração): "afiliado.regras" (geral) e "afiliado.nivel.<id>" (cada afiliado).
 */
export const LEVELS = ['bronze', 'prata', 'ouro', 'diamante'] as const;
export type Level = (typeof LEVELS)[number];
export const LEVEL_NAMES: Record<Level, string> = { bronze: 'Bronze', prata: 'Prata', ouro: 'Ouro', diamante: 'Diamante' };

export type LevelLimit = { maxCotas: number; maxValorCota: number };
/** requisitos: o que o afiliado precisa cumprir para chegar ao nível (texto livre, preenchido depois pela conta principal). */
export type AffiliateRules = { niveis: Record<Level, LevelLimit>; requisitos: Record<Level, string>; comissaoMaxPct: number; comissaoTravada: boolean };
export type AffiliateLevel = { nivel: Level; manual: LevelLimit | null };

export const DEFAULT_RULES: AffiliateRules = {
  niveis: {
    bronze: { maxCotas: 25, maxValorCota: 80 },
    prata: { maxCotas: 35, maxValorCota: 100 },
    ouro: { maxCotas: 50, maxValorCota: 150 },
    diamante: { maxCotas: 100, maxValorCota: 200 },
  },
  requisitos: { bronze: 'Nível inicial: todo afiliado começa aqui.', prata: '', ouro: '', diamante: '' },
  comissaoMaxPct: 35,
  comissaoTravada: true,
};
/** Todo afiliado começa no nível mais baixo (Bronze) e sobe quando o administrador muda o nível. */
export const DEFAULT_LEVEL: AffiliateLevel = { nivel: 'bronze', manual: null };

export const RULES_KEY = 'afiliado.regras';
export const levelKey = (afiliadoId: string) => `afiliado.nivel.${afiliadoId}`;

type ConfigStore = { configuracaoSistema?: { findUnique: (args: { where: { chave: string } }) => Promise<{ valor: string } | null> } };

const isLevel = (value: unknown): value is Level => typeof value === 'string' && (LEVELS as readonly string[]).includes(value);
const positive = (value: unknown, max: number) => { const n = Number(value); return Number.isFinite(n) && n > 0 && n <= max ? n : null; };
const money2 = (value: number) => Math.round(value * 100) / 100;

function cleanLimit(raw: unknown, fallback: LevelLimit | null): LevelLimit | null {
  const item = (raw ?? {}) as Partial<LevelLimit>;
  const cotas = positive(item.maxCotas, 100000);
  const valor = positive(item.maxValorCota, 1000000);
  if (cotas === null || valor === null) return fallback;
  return { maxCotas: Math.floor(cotas), maxValorCota: money2(valor) };
}

export function normalizeRules(raw: unknown): AffiliateRules {
  const data = (raw ?? {}) as Partial<AffiliateRules>;
  const niveis = Object.fromEntries(LEVELS.map((level) => [level, cleanLimit(data.niveis?.[level], DEFAULT_RULES.niveis[level])!])) as Record<Level, LevelLimit>;
  const pct = Number(data.comissaoMaxPct);
  const requisitos = Object.fromEntries(LEVELS.map((level) => { const text = data.requisitos?.[level]; return [level, typeof text === 'string' ? text.trim().slice(0, 600) : DEFAULT_RULES.requisitos[level]]; })) as Record<Level, string>;
  return {
    niveis,
    requisitos,
    comissaoMaxPct: Number.isFinite(pct) && pct >= 0 && pct <= 100 ? money2(pct) : DEFAULT_RULES.comissaoMaxPct,
    comissaoTravada: data.comissaoTravada === undefined ? DEFAULT_RULES.comissaoTravada : data.comissaoTravada === true,
  };
}

export function normalizeLevel(raw: unknown): AffiliateLevel {
  const data = (raw ?? {}) as Partial<AffiliateLevel>;
  return { nivel: isLevel(data.nivel) ? data.nivel : DEFAULT_LEVEL.nivel, manual: data.manual ? cleanLimit(data.manual, null) : null };
}

async function readJson(store: ConfigStore, key: string): Promise<unknown> {
  if (!store.configuracaoSistema?.findUnique) return null;
  const row = await store.configuracaoSistema.findUnique({ where: { chave: key } }).catch(() => null);
  if (!row?.valor) return null;
  try { return JSON.parse(row.valor); } catch { return null; }
}

export async function readRules(store: ConfigStore): Promise<AffiliateRules> { return normalizeRules(await readJson(store, RULES_KEY)); }
export async function readLevel(store: ConfigStore, afiliadoId: string): Promise<AffiliateLevel> { return normalizeLevel(await readJson(store, levelKey(afiliadoId))); }

/** Limite que vale para o afiliado: o manual (quando autorizado pelo administrador) ou o do nível. */
export function effectiveLimit(rules: AffiliateRules, level: AffiliateLevel): LevelLimit & { origem: 'manual' | 'nivel' } {
  return level.manual ? { ...level.manual, origem: 'manual' } : { ...rules.niveis[level.nivel], origem: 'nivel' };
}

export async function affiliateLimits(store: ConfigStore, afiliadoId: string) {
  const [rules, level] = await Promise.all([readRules(store), readLevel(store, afiliadoId)]);
  const limit = effectiveLimit(rules, level);
  const next = LEVELS[LEVELS.indexOf(level.nivel) + 1] ?? null;
  return { nivel: level.nivel, nomeNivel: LEVEL_NAMES[level.nivel], manual: level.manual, maxCotas: limit.maxCotas, maxValorCota: limit.maxValorCota, origem: limit.origem, proximoNivel: next ? { nivel: next, nomeNivel: LEVEL_NAMES[next], requisitos: rules.requisitos[next] || null, ...rules.niveis[next] } : null };
}

const brl = (value: number) => `R$ ${value.toFixed(2).replace('.', ',')}`;

/** Trava do afiliado na criação e na edição do bolão: máximo de cotas e valor máximo da cota do nível (ou do limite manual). */
export async function assertAffiliatePoolLimits(store: ConfigStore, afiliadoId: string, values: { totalCotas?: number | null; valorCota?: number | null }) {
  const limits = await affiliateLimits(store, afiliadoId);
  const label = limits.origem === 'manual' ? 'seu limite autorizado pelo administrador' : `o nível ${limits.nomeNivel}`;
  if (values.totalCotas !== undefined && values.totalCotas !== null && values.totalCotas > limits.maxCotas) throw new ConflictException(`Com ${label}, cada bolão pode ter no máximo ${limits.maxCotas} cotas.`);
  if (values.valorCota !== undefined && values.valorCota !== null && money2(values.valorCota) > limits.maxValorCota) throw new ConflictException(`Com ${label}, o valor da cota pode ser no máximo ${brl(limits.maxValorCota)}.`);
}

/** Teto da comissão do afiliado: travado (padrão 35%) até a conta principal destravar ou mudar o valor. */
export async function assertCommissionCeiling(store: ConfigStore, pct: number | null | undefined) {
  if (pct === undefined || pct === null || Number.isNaN(Number(pct))) return;
  const rules = await readRules(store);
  if (rules.comissaoTravada && Number(pct) > rules.comissaoMaxPct) throw new ConflictException(`A comissão do afiliado está travada em no máximo ${rules.comissaoMaxPct.toLocaleString('pt-BR')}%. Para passar disso, a conta principal destrava em Configurações > Regras dos afiliados.`);
}
