/**
 * Regras puras da transferência de cotistas entre bolões (sem banco), para testar sem montar o sistema todo.
 * Transferir = mover cotas JÁ PAGAS de um bolão para outro do mesmo concurso, mesmo valor e mesma taxa.
 */
export interface TransferPool {
  id: string;
  status: string;
  concursoId: string;
  valorCota: string | number | { toString(): string };
  taxaAdministracaoPct: string | number | { toString(): string };
  totalCotas: number | null;
  cotasIlimitadas: boolean;
  cotasVendidas: number;
  maxCotasPorPessoa: number | null;
  jogos: Array<{ numeros: number[] }>;
  concurso: { dataSorteio: Date; status?: string | null; resultado?: unknown };
}

export interface TransferShare { id: string; compradorId: string; quantidade: number }

const same = (a: unknown, b: unknown) => Number(String(a)) === Number(String(b));

/** Assinatura dos jogos: mesma lista de dezenas (em qualquer ordem) = mesmos jogos. */
export function gamesSignature(jogos: Array<{ numeros: number[] }>): string {
  return jogos.map((game) => [...game.numeros].sort((a, b) => a - b).join('-')).sort().join('|');
}

/** Por que o bolão de ORIGEM não pode ter cotistas transferidos (null = pode). */
export function sourceBlocker(pool: TransferPool, now: Date = new Date()): string | null {
  if (!['aberto', 'fechado'].includes(pool.status)) return pool.status === 'registrado' || pool.status === 'apurado' ? 'Este bolão já foi registrado na lotérica: as cotas não podem mais sair dele.' : 'Só dá para transferir cotistas de um bolão aberto ou fechado.';
  if (pool.concurso.resultado || pool.concurso.dataSorteio <= now) return 'O sorteio deste concurso já aconteceu.';
  return null;
}

/** Por que o bolão de DESTINO não serve (null = serve). */
export function destinationBlocker(source: TransferPool, dest: TransferPool, now: Date = new Date()): string | null {
  if (source.id === dest.id) return 'Escolha um bolão diferente do que está de saída.';
  if (dest.concursoId !== source.concursoId) return 'O bolão de destino precisa ser do mesmo concurso.';
  if (!same(dest.valorCota, source.valorCota)) return 'O valor da cota do bolão de destino é diferente.';
  if (!same(dest.taxaAdministracaoPct, source.taxaAdministracaoPct)) return 'A taxa de administração do bolão de destino é diferente.';
  if (!['aberto', 'fechado'].includes(dest.status)) return dest.status === 'registrado' || dest.status === 'apurado' ? 'O bolão de destino já foi registrado na lotérica.' : 'O bolão de destino precisa estar aberto ou fechado (não registrado).';
  if (dest.concurso.resultado || dest.concurso.dataSorteio <= now) return 'O sorteio deste concurso já aconteceu.';
  return null;
}

export function freeSlots(pool: Pick<TransferPool, 'cotasIlimitadas' | 'totalCotas' | 'cotasVendidas'>): number | null {
  return pool.cotasIlimitadas ? null : Math.max(0, (pool.totalCotas ?? 0) - pool.cotasVendidas);
}

export interface TransferPlan {
  cotas: number;
  pessoas: number;
  erros: string[];
  avisos: string[];
  jogosDiferentes: boolean;
}

/**
 * Confere tudo o que precisa ser verdade antes de mover. `heldInDest` = cotas que cada pessoa já tem no destino
 * (pagas ou reservadas ainda válidas), para respeitar o limite por pessoa.
 */
export function planTransfer(input: { source: TransferPool; dest: TransferPool; shares: TransferShare[]; heldInDest: Map<string, number>; confirmarJogosDiferentes?: boolean; now?: Date }): TransferPlan {
  const { source, dest, shares, heldInDest } = input;
  const now = input.now ?? new Date();
  const erros: string[] = [];
  const avisos: string[] = [];
  const blockedSource = sourceBlocker(source, now);
  if (blockedSource) erros.push(blockedSource);
  const blockedDest = destinationBlocker(source, dest, now);
  if (blockedDest) erros.push(blockedDest);
  const cotas = shares.reduce((sum, share) => sum + share.quantidade, 0);
  const pessoas = new Set(shares.map((share) => share.compradorId)).size;
  if (cotas <= 0) erros.push('Não há cotas pagas para transferir.');
  const free = freeSlots(dest);
  if (free !== null && cotas > free) erros.push(`O bolão de destino só tem ${free} cota${free === 1 ? '' : 's'} livre${free === 1 ? '' : 's'} e a transferência é de ${cotas}.`);
  if (dest.maxCotasPorPessoa !== null && dest.maxCotasPorPessoa !== undefined) {
    const byPerson = new Map<string, number>();
    for (const share of shares) byPerson.set(share.compradorId, (byPerson.get(share.compradorId) ?? 0) + share.quantidade);
    let over = 0;
    for (const [person, moving] of byPerson) if ((heldInDest.get(person) ?? 0) + moving > dest.maxCotasPorPessoa) over += 1;
    if (over > 0) erros.push(`${over} pessoa${over === 1 ? '' : 's'} passaria${over === 1 ? '' : 'm'} do limite de ${dest.maxCotasPorPessoa} cotas por pessoa do bolão de destino.`);
  }
  const jogosDiferentes = gamesSignature(source.jogos) !== gamesSignature(dest.jogos);
  if (jogosDiferentes) {
    if (input.confirmarJogosDiferentes) avisos.push('Os jogos do bolão de destino são diferentes dos do bolão de origem.');
    else erros.push('Os jogos do bolão de destino são diferentes. Confirme que quer transferir mesmo assim.');
  }
  return { cotas, pessoas, erros, avisos, jogosDiferentes };
}
