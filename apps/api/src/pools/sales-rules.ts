import { ConflictException } from '@nestjs/common';

export type SalesRulesInput = {
  vendaInicioEm?: string | null;
  vendaFimEm?: string | null;
  maxCotasPorPessoa?: number | null;
  regrasVenda?: string | null;
};

export type SalesRules = {
  vendaInicioEm: Date | null;
  vendaFimEm: Date | null;
  maxCotasPorPessoa: number | null;
  regrasVenda: string | null;
};

function toDate(value: string | null | undefined, label: string): Date | null | undefined {
  if (value === undefined) return undefined;
  if (value === null || value === '') return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) throw new ConflictException(`${label} inválida.`);
  return date;
}

/**
 * Valida as regras de venda escolhidas pelo administrador. Campos ausentes (undefined) ficam como estão;
 * null limpa a regra. A venda nunca pode passar do prazo (cutoff) do concurso.
 */
export function parseSalesRules(input: SalesRulesInput, ctx: { cutoffAt: Date; totalCotas: number | null; current?: Partial<SalesRules> }): Partial<SalesRules> {
  const out: Partial<SalesRules> = {};
  const inicio = toDate(input.vendaInicioEm, 'Data de início da venda');
  const fim = toDate(input.vendaFimEm, 'Data de fim da venda');
  if (inicio !== undefined) out.vendaInicioEm = inicio;
  if (fim !== undefined) out.vendaFimEm = fim;
  if (input.maxCotasPorPessoa !== undefined) out.maxCotasPorPessoa = input.maxCotasPorPessoa;
  if (input.regrasVenda !== undefined) out.regrasVenda = input.regrasVenda === null || input.regrasVenda.trim() === '' ? null : input.regrasVenda.trim();

  const nextInicio = out.vendaInicioEm !== undefined ? out.vendaInicioEm : ctx.current?.vendaInicioEm ?? null;
  const nextFim = out.vendaFimEm !== undefined ? out.vendaFimEm : ctx.current?.vendaFimEm ?? null;
  if (nextFim && nextFim.getTime() > ctx.cutoffAt.getTime()) throw new ConflictException('O fim da venda não pode passar do prazo de compra do concurso.');
  if (nextInicio && nextFim && nextInicio.getTime() >= nextFim.getTime()) throw new ConflictException('O início da venda precisa ser antes do fim.');
  const nextMax = out.maxCotasPorPessoa !== undefined ? out.maxCotasPorPessoa : ctx.current?.maxCotasPorPessoa ?? null;
  if (nextMax !== null && nextMax !== undefined && ctx.totalCotas !== null && nextMax > ctx.totalCotas) throw new ConflictException('O limite por pessoa não pode ser maior que o total de cotas.');
  return out;
}

/**
 * Janela de venda automática: começa quando o bolão é criado/aprovado e termina no prazo de compra do concurso
 * (o prazo já acompanha o dia e o horário do sorteio). Datas salvas antes continuam valendo, mas nunca passam do prazo.
 */
export function effectiveSaleWindow(pool: { vendaInicioEm?: Date | null; vendaFimEm?: Date | null; aprovadoEm?: Date | null; criadoEm?: Date | null }, cutoffAt?: Date | null) {
  const inicioEm = pool.vendaInicioEm ?? pool.aprovadoEm ?? pool.criadoEm ?? null;
  let fimEm = pool.vendaFimEm ?? cutoffAt ?? null;
  if (fimEm && cutoffAt && fimEm.getTime() > cutoffAt.getTime()) fimEm = cutoffAt;
  return { inicioEm, fimEm, automatico: { inicio: !pool.vendaInicioEm, fim: !pool.vendaFimEm } };
}

export type SaleWindow = 'em_breve' | 'aberta' | 'encerrada';

export function saleWindow(pool: { vendaInicioEm?: Date | null; vendaFimEm?: Date | null }, now = new Date()): SaleWindow {
  if (pool.vendaInicioEm && now.getTime() < pool.vendaInicioEm.getTime()) return 'em_breve';
  if (pool.vendaFimEm && now.getTime() >= pool.vendaFimEm.getTime()) return 'encerrada';
  return 'aberta';
}

const fmt = (date: Date) => date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' });

/** Mensagem de bloqueio da janela de venda, ou null se pode comprar. */
export function saleWindowMessage(pool: { vendaInicioEm?: Date | null; vendaFimEm?: Date | null }, now = new Date()): string | null {
  const state = saleWindow(pool, now);
  if (state === 'em_breve') return `A venda deste bolão começa em ${fmt(pool.vendaInicioEm!)}.`;
  if (state === 'encerrada') return 'A venda de cotas deste bolão foi encerrada.';
  return null;
}

/** Quantas cotas ainda cabem para esta pessoa (null = sem limite). */
export function remainingForPerson(max: number | null | undefined, alreadyHas: number): number | null {
  if (max === null || max === undefined) return null;
  return Math.max(max - alreadyHas, 0);
}
