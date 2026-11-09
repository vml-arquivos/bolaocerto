/** Regras de segmentação do CRM. Puras (sem banco) para serem fáceis de testar e ajustar. */

export interface CrmConfig {
  prata: number;
  ouro: number;
  diamante: number;
  inativoDias: number;
  novoDias: number;
  recorrenteMinBoloes: number;
}

export const DEFAULT_CRM_CONFIG: CrmConfig = { prata: 1000, ouro: 5000, diamante: 20000, inativoDias: 90, novoDias: 30, recorrenteMinBoloes: 3 };

export function crmConfigFromEnv(env: NodeJS.ProcessEnv = process.env): CrmConfig {
  const read = (key: string, fallback: number) => { const value = Number(env[key]); return Number.isFinite(value) && value > 0 ? value : fallback; };
  return {
    prata: read('CRM_NIVEL_PRATA', DEFAULT_CRM_CONFIG.prata),
    ouro: read('CRM_NIVEL_OURO', DEFAULT_CRM_CONFIG.ouro),
    diamante: read('CRM_NIVEL_DIAMANTE', DEFAULT_CRM_CONFIG.diamante),
    inativoDias: read('CRM_INATIVO_DIAS', DEFAULT_CRM_CONFIG.inativoDias),
    novoDias: read('CRM_NOVO_DIAS', DEFAULT_CRM_CONFIG.novoDias),
    recorrenteMinBoloes: read('CRM_RECORRENTE_MIN_BOLOES', DEFAULT_CRM_CONFIG.recorrenteMinBoloes),
  };
}

export interface BettorMetrics {
  totalGasto: number;
  cotasPagas: number;
  compras: number;
  boloesDistintos: number;
  primeiraCompraEm: Date | null;
  ultimaCompraEm: Date | null;
  cotasPendentes: number;
  valorPendente: number;
  reservasVencidas: number;
  /** Reservas que já foram canceladas por falta de pagamento no prazo. */
  reservasCanceladas: number;
}

export type Nivel = 'diamante' | 'ouro' | 'prata' | 'bronze' | 'sem_compra';
export type Segmento = 'vip' | 'recorrente' | 'novo' | 'inativo' | 'sem_compra' | 'inadimplente';

export const SEGMENT_LABELS: Record<Segmento, string> = {
  vip: 'Apostador maior (VIP)', recorrente: 'Recorrente', novo: 'Novo', inativo: 'Inativo', sem_compra: 'Ainda não comprou', inadimplente: 'Com pendência de pagamento',
};
export const LEVEL_LABELS: Record<Nivel, string> = { diamante: 'Diamante', ouro: 'Ouro', prata: 'Prata', bronze: 'Bronze', sem_compra: '—' };

export const EMPTY_METRICS: BettorMetrics = { totalGasto: 0, cotasPagas: 0, compras: 0, boloesDistintos: 0, primeiraCompraEm: null, ultimaCompraEm: null, cotasPendentes: 0, valorPendente: 0, reservasVencidas: 0, reservasCanceladas: 0 };

export function levelFor(totalGasto: number, cfg: CrmConfig = DEFAULT_CRM_CONFIG): Nivel {
  if (totalGasto <= 0) return 'sem_compra';
  if (totalGasto >= cfg.diamante) return 'diamante';
  if (totalGasto >= cfg.ouro) return 'ouro';
  if (totalGasto >= cfg.prata) return 'prata';
  return 'bronze';
}

const DAY = 86_400_000;

/** Um apostador pode pertencer a vários segmentos ao mesmo tempo (ex.: VIP e inativo). */
export function classify(metrics: BettorMetrics, tags: string[], now: Date, cfg: CrmConfig = DEFAULT_CRM_CONFIG): { nivel: Nivel; segmentos: Segmento[] } {
  const nivel = levelFor(metrics.totalGasto, cfg);
  const segmentos: Segmento[] = [];
  const bought = metrics.compras > 0;
  const days = (date: Date | null) => (date ? (now.getTime() - date.getTime()) / DAY : Infinity);
  if (!bought) segmentos.push('sem_compra');
  if (nivel === 'prata' || nivel === 'ouro' || nivel === 'diamante' || tags.includes('vip')) segmentos.push('vip');
  if (bought && days(metrics.ultimaCompraEm) > cfg.inativoDias) segmentos.push('inativo');
  if (metrics.boloesDistintos >= cfg.recorrenteMinBoloes) segmentos.push('recorrente');
  if (bought && days(metrics.primeiraCompraEm) <= cfg.novoDias) segmentos.push('novo');
  if (metrics.reservasVencidas > 0 || metrics.cotasPendentes > 0) segmentos.push('inadimplente');
  return { nivel, segmentos };
}

/** Esteira de venda: onde cada cliente está no caminho entre o cadastro e a compra recorrente. */
export type Etapa = 'cadastrado' | 'reservou' | 'reserva_vencida' | 'pagou' | 'recorrente' | 'inativo';
export const ETAPAS: Etapa[] = ['cadastrado', 'reservou', 'reserva_vencida', 'pagou', 'recorrente', 'inativo'];
export const ETAPA_LABELS: Record<Etapa, string> = {
  cadastrado: 'Cadastrado (ainda não reservou)', reservou: 'Reservou (falta pagar)', reserva_vencida: 'Reserva vencida (não pagou)', pagou: 'Cliente (já pagou)', recorrente: 'Recorrente', inativo: 'Inativo',
};
export const ETAPA_ACOES: Record<Etapa, string> = {
  cadastrado: 'Mostrar um bolão aberto e o passo a passo da compra.',
  reservou: 'Lembrar do pagamento antes de a reserva vencer.',
  reserva_vencida: 'Perguntar se houve dificuldade e oferecer nova reserva.',
  pagou: 'Agradecer, avisar do resultado e convidar para o próximo bolão.',
  recorrente: 'Manter o relacionamento e avisar dos bolões novos.',
  inativo: 'Reativar com um bolão novo ou uma condição especial.',
};

export function etapaFunil(metrics: BettorMetrics, now: Date, cfg: CrmConfig = DEFAULT_CRM_CONFIG): Etapa {
  if (metrics.compras > 0) {
    const sinceLast = metrics.ultimaCompraEm ? (now.getTime() - metrics.ultimaCompraEm.getTime()) / DAY : Infinity;
    if (sinceLast > cfg.inativoDias) return 'inativo';
    return metrics.boloesDistintos >= cfg.recorrenteMinBoloes ? 'recorrente' : 'pagou';
  }
  if (metrics.cotasPendentes > 0 && metrics.reservasVencidas === 0) return 'reservou';
  if (metrics.reservasVencidas > 0 || metrics.reservasCanceladas > 0) return 'reserva_vencida';
  return 'cadastrado';
}

/** Resumo do funil: quantos em cada etapa e quanto do total avançou (reservou → pagou). */
export function buildFunnel(rows: Array<{ etapa: Etapa; compras: number; cotasPendentes: number; reservasVencidas: number; reservasCanceladas?: number }>) {
  const total = rows.length;
  const reserved = rows.filter((row) => row.compras > 0 || row.cotasPendentes > 0 || row.reservasVencidas > 0 || (row.reservasCanceladas ?? 0) > 0).length;
  const paid = rows.filter((row) => row.compras > 0).length;
  const pct = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 1000) / 10 : 0);
  return {
    etapas: ETAPAS.map((etapa) => ({ chave: etapa, nome: ETAPA_LABELS[etapa], acao: ETAPA_ACOES[etapa], clientes: rows.filter((row) => row.etapa === etapa).length })),
    totais: { cadastrados: total, jaReservaram: reserved, jaPagaram: paid, reservaramPct: pct(reserved, total), pagaramPct: pct(paid, total), pagaramDeReservaramPct: pct(paid, reserved) },
  };
}
