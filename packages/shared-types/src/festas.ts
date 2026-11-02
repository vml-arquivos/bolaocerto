/**
 * Concursos de festa (Mega da Virada, Mega do São João, Quina de São João...).
 * Muitas vezes o número oficial só sai perto do sorteio. Até lá o concurso existe com um número provisório
 * NEGATIVO (-AAAAMMDD, pela data do sorteio) e `numeroDefinido = false`. Quando a sincronização com a CAIXA
 * traz o concurso real da mesma data, os bolões passam para o número oficial sem ninguém precisar mexer.
 */
export interface FestaPreset { chave: string; nome: string; modalidade: string }

export const FESTAS_PRESETS: readonly FestaPreset[] = [
  { chave: 'mega-da-virada', nome: 'Mega da Virada', modalidade: 'megasena' },
  { chave: 'mega-sao-joao', nome: 'Mega do São João', modalidade: 'megasena' },
  { chave: 'mega-pascoa', nome: 'Mega de Páscoa', modalidade: 'megasena' },
  { chave: 'mega-independencia', nome: 'Mega da Independência', modalidade: 'megasena' },
  { chave: 'lotofacil-independencia', nome: 'Lotofácil da Independência', modalidade: 'lotofacil' },
  { chave: 'quina-sao-joao', nome: 'Quina de São João', modalidade: 'quina' },
  { chave: 'dupla-pascoa', nome: 'Dupla de Páscoa', modalidade: 'duplasena' },
];

/** Dia civil em Brasília no formato AAAA-MM-DD. */
export function brazilDayKey(value: Date): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(value);
}

/** Número provisório (negativo) de um concurso de festa que ainda não tem número oficial. */
export function provisionalContestNumber(drawDate: Date): number {
  return -Number(brazilDayKey(drawDate).replace(/-/g, ''));
}

/** Rótulo para mostrar o concurso: "Mega da Virada · concurso a definir" ou "Concurso 2980". */
export function contestLabel(contest: { numeroConcurso: number; numeroDefinido?: boolean | null; nomeEspecial?: string | null }): string {
  const defined = contest.numeroDefinido !== false && contest.numeroConcurso > 0;
  if (contest.nomeEspecial) return defined ? `${contest.nomeEspecial} · concurso ${contest.numeroConcurso}` : `${contest.nomeEspecial} · concurso a definir`;
  return defined ? `Concurso ${contest.numeroConcurso}` : 'Concurso a definir';
}

/** Parte mínima do cliente Prisma (ou de uma transação) usada para adotar concursos provisórios. */
export interface FestaTx {
  concurso: {
    findMany(args: { where: Record<string, unknown> }): Promise<Array<{ id: string; dataSorteio: Date; especial: string | null; nomeEspecial: string | null }>>;
    findUnique(args: { where: Record<string, unknown> }): Promise<{ id: string; especial: string | null } | null>;
    update(args: { where: { id: string }; data: Record<string, unknown> }): Promise<unknown>;
    delete(args: { where: { id: string } }): Promise<unknown>;
  };
  bolao: { updateMany(args: { where: Record<string, unknown>; data: Record<string, unknown> }): Promise<{ count: number }> };
}

/**
 * Se existe um concurso de festa provisório da mesma modalidade e do mesmo dia do concurso oficial `realNumber`,
 * ele passa a ser o oficial. Retorna quantos concursos provisórios foram adotados (0 ou mais).
 * - Se o oficial ainda não existe: o provisório ganha o número oficial.
 * - Se o oficial já existe: os bolões migram para ele, o nome de festa é copiado e o provisório é removido.
 */
export async function adoptProvisionalContests(tx: FestaTx, modalidade: string, realNumber: number, drawDate: Date): Promise<number> {
  if (!Number.isInteger(realNumber) || realNumber <= 0) return 0;
  const day = brazilDayKey(drawDate);
  const candidates = (await tx.concurso.findMany({ where: { modalidade, numeroDefinido: false } })).filter((contest) => brazilDayKey(contest.dataSorteio) === day);
  let adopted = 0;
  for (const provisional of candidates) {
    const real = await tx.concurso.findUnique({ where: { modalidade_numeroConcurso: { modalidade, numeroConcurso: realNumber } } });
    if (!real) {
      await tx.concurso.update({ where: { id: provisional.id }, data: { numeroConcurso: realNumber, numeroDefinido: true } });
    } else {
      await tx.bolao.updateMany({ where: { concursoId: provisional.id }, data: { concursoId: real.id } });
      await tx.concurso.update({ where: { id: real.id }, data: { especial: real.especial ?? provisional.especial, nomeEspecial: provisional.nomeEspecial, numeroDefinido: true } });
      await tx.concurso.delete({ where: { id: provisional.id } });
    }
    adopted += 1;
  }
  return adopted;
}
