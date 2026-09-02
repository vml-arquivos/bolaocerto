export type PublicContest = {
  id: string; modalidade: string; numeroConcurso: number; dataSorteio: string; cutoffAt: string;
  valorEstimadoPremio: string | number | null; acumulado: boolean;
};

export type PublicPool = {
  id: string; concursoId: string; grupoId: string; numerosApostados: number[]; totalCotas: number;
  cotasDisponiveis: number; valorCota: string; taxaAdministracaoPct: string; modeloOperacional: string;
  status: string; teveGanhador: boolean; concurso?: Omit<PublicContest, 'id'>;
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
