/** Concursos de festa (Mega da Virada...) podem não ter número oficial ainda: o sistema guarda um número negativo provisório. */
export type ContestLike = { numeroConcurso?: number | null; numeroDefinido?: boolean | null; nomeEspecial?: string | null };

/** Número para mostrar: "2980" ou "a definir". */
export function concursoNo(value?: number | null): string {
  return typeof value === 'number' && value > 0 ? String(value) : 'a definir';
}

/** "Mega da Virada · " quando o concurso é de festa, senão vazio. */
export function festaPrefix(contest?: ContestLike | null): string {
  return contest?.nomeEspecial ? `${contest.nomeEspecial} · ` : '';
}

/** Texto completo: "Mega da Virada · concurso a definir" ou "Concurso 2980". */
export function contestLabel(contest?: ContestLike | null): string {
  const number = concursoNo(contest?.numeroConcurso);
  return `${festaPrefix(contest)}${festaPrefix(contest) ? 'concurso' : 'Concurso'} ${number}`;
}
