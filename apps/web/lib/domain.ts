export type PublicContest = {
  id: string; modalidade: string; numeroConcurso: number; dataSorteio: string; cutoffAt: string;
  valorEstimadoPremio: string | number | null; acumulado: boolean;
};

export type PoolRelease = { condicional: boolean; liberado: boolean; gatilho: number | null; premioAtual: number | null; faltam: number | null; progressoPct: number | null; mensagem: string | null };

export type PoolGameResult = { ordem: number; numeros: number[]; acertos: number; acertosSegundoSorteio: number | null; premios: Array<{ faixa: string; sorteio: number; acertos: number; valor: number }>; total: number };
export type PoolTransparency = {
  registradoEm: string | null; codigoBilhete: string | null; comprovanteUrl: string | null; apuradoEm: string | null; premioTotal: string | null;
  prazoResgateAte?: string | null;
  anexos?: Array<{ id: string; tipo: string; nome: string; mime: string; tamanho: number; sha256: string; enviadoEm: string }>;
  apuracao: { concurso: number; sorteados: number[]; segundoSorteio: number[]; melhorFaixa: string | null; jogos: PoolGameResult[] } | null;
};

export type PublicPool = {
  id: string; concursoId: string; grupoId: string; numerosApostados: number[]; totalCotas: number | null;
  cotasIlimitadas: boolean; cotasVendidas?: number; cotasDisponiveis: number | null; valorCota: string; taxaAdministracaoPct: string; modeloOperacional: string;
  status: string; teveGanhador: boolean; concurso?: Omit<PublicContest, 'id'>;
  liberacao?: PoolRelease;
  jogos?: Array<{ id: string; ordem: number; numeros: number[] }>;
  transparencia?: PoolTransparency | null;
  grupo?: { nome: string; slug: string; descricao: string | null };
};

export const modalityNames: Record<string, string> = {
  megasena: 'Mega-Sena', lotofacil: 'Lotofácil', quina: 'Quina', lotomania: 'Lotomania',
  duplasena: 'Dupla Sena', timemania: 'Timemania', diadesorte: 'Dia de Sorte', loteca: 'Loteca', supersete: 'Super Sete',
};

export function money(value: string | number | null | undefined) {
  if (value === null || value === undefined) return '—';
  return new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(Number(value));
}

export function shortDate(value?: string) {
  if (!value) return 'A definir';
  return new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(value));
}
