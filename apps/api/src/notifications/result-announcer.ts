import { Injectable, Logger } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { PrismaService } from '../common/prisma.service';
import { MODALITY_NAMES } from '../reports/pdf.util';
import { NotificationsService } from './notifications.service';

export const TIPO_RESULTADO = 'bolao.apurado';
const WINDOW_DAYS = 3;
const MAX_PER_RUN = 800;
const SOLD = ['paga', 'registrada', 'apurada', 'premiada'] as const;
const two = (n: number) => String(n).padStart(2, '0');

/** Melhor jogo do bolão: quantos números acertou (conta também o 2º sorteio da Dupla Sena). */
export function bestHits(games: number[][], drawn: number[], second: number[] = []) {
  const hits = new Set([...drawn, ...second]);
  return games.reduce((best, game) => Math.max(best, game.filter((n) => hits.has(n)).length), 0);
}

/** Texto do aviso de resultado para o cotista. */
export function resultMessage(input: { modalidade: string; numeroConcurso: number; grupo?: string | null; drawn: number[]; second?: number[]; best: number; jogos: number }) {
  const name = `${MODALITY_NAMES[input.modalidade] ?? input.modalidade} ${input.numeroConcurso}`;
  const numbers = input.drawn.map(two).join(' · ');
  const extra = input.second?.length ? ` 2º sorteio: ${input.second.map(two).join(' · ')}.` : '';
  const hits = input.jogos ? ` No seu bolão${input.grupo ? ` (${input.grupo})` : ''}, o melhor jogo${input.jogos > 1 ? ` de ${input.jogos}` : ''} fez ${input.best} ${input.best === 1 ? 'acerto' : 'acertos'}.` : '';
  return { titulo: `Saiu o resultado: ${name}`, mensagem: `Números sorteados: ${numbers}.${extra}${hits} Toque para ver seus jogos com os acertos marcados com X.` };
}

/**
 * Assim que o resultado oficial da CAIXA é sincronizado, cada cotista dos bolões daquele concurso recebe um aviso (push e na conta)
 * com os números sorteados e quantos acertos o bolão fez; o link abre o bolão com o X em cada número acertado.
 * Cada pessoa recebe uma vez por bolão (chave no aviso), mesmo que o resultado seja sincronizado de novo.
 */
@Injectable()
export class ResultAnnouncer {
  private readonly logger = new Logger(ResultAnnouncer.name);
  private busy = false;

  constructor(private readonly prisma: PrismaService, private readonly notifications: NotificationsService) {}

  @Cron('*/2 * * * *')
  async announce(): Promise<number> {
    if (this.busy) return 0;
    this.busy = true;
    try {
      const since = new Date(Date.now() - WINDOW_DAYS * 86_400_000);
      const results = await this.prisma.resultado.findMany({ where: { apuradoEm: { gte: since } }, select: { concursoId: true, numerosSorteados: true, numerosSegundoSorteio: true } });
      const withNumbers = results.filter((row) => row.numerosSorteados.length > 0);
      if (!withNumbers.length) return 0;
      const sentRows = await this.prisma.notificacao.findMany({ where: { tipo: TIPO_RESULTADO, criadoEm: { gte: new Date(since.getTime() - 7 * 86_400_000) } }, select: { usuarioId: true, payload: true } });
      const sent = new Set(sentRows.map((row) => `${row.usuarioId}|${String((row.payload as { chave?: unknown } | null)?.chave ?? '')}`));
      let created = 0;
      for (const result of withNumbers) {
        const pools = await this.prisma.bolao.findMany({
          where: { concursoId: result.concursoId, status: { not: 'cancelado' } },
          select: { id: true, numerosApostados: true, grupo: { select: { nome: true } }, concurso: { select: { modalidade: true, numeroConcurso: true } }, jogos: { select: { numeros: true } }, cotas: { where: { status: { in: [...SOLD] } }, select: { compradorId: true } } },
        });
        for (const pool of pools) {
          const games = pool.jogos.length ? pool.jogos.map((game) => game.numeros) : pool.numerosApostados.length ? [pool.numerosApostados] : [];
          const best = bestHits(games, result.numerosSorteados, result.numerosSegundoSorteio ?? []);
          const text = resultMessage({ modalidade: pool.concurso.modalidade, numeroConcurso: pool.concurso.numeroConcurso, grupo: pool.grupo?.nome, drawn: result.numerosSorteados, second: result.numerosSegundoSorteio ?? [], best, jogos: games.length });
          for (const buyer of new Set(pool.cotas.map((share) => share.compradorId))) {
            const chave = `resultado:${pool.id}`;
            if (sent.has(`${buyer}|${chave}`)) continue;
            if (created >= MAX_PER_RUN) return created;
            await this.notifications.notify(buyer, TIPO_RESULTADO, { ...text, chave, bolaoId: pool.id, link: `/boloes/${pool.id}`, acertos: best });
            sent.add(`${buyer}|${chave}`);
            created += 1;
          }
        }
      }
      return created;
    } catch (error) {
      this.logger.error(`Aviso de resultado falhou: ${error instanceof Error ? error.message : String(error)}`);
      return 0;
    } finally {
      this.busy = false;
    }
  }
}
