import { BadRequestException } from '@nestjs/common';
import { calculateBrazilCutoff, provisionalContestNumber } from '@bolaocerto/shared-types';

type Db = {
  concurso: { findFirst: (args: never) => Promise<{ numeroConcurso: number } | null>; findMany: (args: never) => Promise<any[]>; findUnique: (args: never) => Promise<any>; update: (args: never) => Promise<any> };
  resultado: { deleteMany: (args: never) => Promise<unknown> };
  configLoteria: { findUnique: (args: never) => Promise<{ horarioCorteLocal: string } | null> };
  $transaction: <T>(cb: (tx: any) => Promise<T>) => Promise<T>;
};

/** Fecha as apostas no horário padrão da modalidade ou 1 hora antes do sorteio, o que vier primeiro (sorteios de manhã). */
export function festivalCutoff(drawDate: Date, horarioCorteLocal: string): Date {
  const standard = calculateBrazilCutoff(drawDate, horarioCorteLocal);
  const beforeDraw = new Date(drawDate.getTime() - 60 * 60 * 1000);
  return standard.getTime() <= beforeDraw.getTime() ? standard : beforeDraw;
}

const NOMES: Record<string, string> = { megasena: 'Mega-Sena', lotofacil: 'Lotofácil', quina: 'Quina', lotomania: 'Lotomania', duplasena: 'Dupla Sena', timemania: 'Timemania', diadesorte: 'Dia de Sorte', supersete: 'Super Sete', loteca: 'Loteca' };

/** Maior número de concurso que já foi sorteado (tem data passada ou já foi apurado). Número de festa/cadastro novo precisa ser maior que ele. */
export async function lastDrawnNumber(db: Pick<Db, 'concurso'>, modalidade: string): Promise<number | null> {
  const row = await db.concurso.findFirst({ where: { modalidade, numeroConcurso: { gt: 0 }, OR: [{ status: 'apurado', especial: null }, { dataSorteio: { lte: new Date() } }] }, orderBy: { numeroConcurso: 'desc' }, select: { numeroConcurso: true } } as never);
  return row?.numeroConcurso ?? null;
}

/** Recusa número de concurso que já foi sorteado: gravar um sorteio futuro com esse número faria a CAIXA "apurar" o concurso errado. */
export async function assertNumberNotDrawn(db: Pick<Db, 'concurso'>, modalidade: string, numero: number): Promise<void> {
  const last = await lastDrawnNumber(db, modalidade);
  if (last !== null && numero <= last) {
    throw new BadRequestException(`O concurso ${numero} da ${NOMES[modalidade] ?? modalidade} já foi sorteado (o último foi o ${last}). Informe um número maior que ${last}, ou deixe o número em branco se a CAIXA ainda não divulgou.`);
  }
}

/**
 * Conserta festa que foi "apurada" por engano (número de concurso antigo): volta a ficar aberta, com número provisório,
 * sem o resultado do sorteio antigo, para poder criar bolão. Festa com bolão só é reaberta. Roda a cada listagem; sem nada quebrado, é uma consulta só.
 */
export async function healBrokenFestivals(db: Db): Promise<number> {
  try {
    const now = new Date();
    const broken = await db.concurso.findMany({ where: { especial: { not: null }, dataSorteio: { gt: now }, OR: [{ status: 'apurado' }, { resultado: { isNot: null } }, { status: 'fechado', cutoffAt: { gt: now } }] }, include: { _count: { select: { boloes: true } } } } as never);
    let fixed = 0;
    for (const row of broken) {
      const config = await db.configLoteria.findUnique({ where: { modalidade: row.modalidade } } as never);
      const cutoffAt = festivalCutoff(row.dataSorteio, config?.horarioCorteLocal ?? '19:00');
      if (row._count.boloes > 0) { await db.concurso.update({ where: { id: row.id }, data: { status: 'aberto', cutoffAt } } as never); fixed += 1; continue; }
      const provisional = provisionalContestNumber(row.dataSorteio);
      const taken = row.numeroConcurso !== provisional && (await db.concurso.findUnique({ where: { modalidade_numeroConcurso: { modalidade: row.modalidade, numeroConcurso: provisional } } } as never));
      await db.$transaction(async (tx) => {
        await tx.resultado.deleteMany({ where: { concursoId: row.id } });
        await tx.concurso.update({ where: { id: row.id }, data: { status: 'aberto', cutoffAt, valorEstimadoPremio: null, acumulado: false, fonteSincronizacao: 'manual', ...(taken ? {} : { numeroConcurso: provisional, numeroDefinido: false }) } });
      });
      fixed += 1;
    }
    return fixed;
  } catch { return 0; }
}
