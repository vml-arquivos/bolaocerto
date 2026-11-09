import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { getLotteryRule, SettlementTier } from '@bolaocerto/shared-types';
import { PrismaService } from '../common/prisma.service';
import { conferirJogos, MAX_GAMES_PER_CHECK } from './conferidor';

@Injectable()
export class ConferidorService {
  constructor(private readonly prisma: PrismaService) {}

  /** Modalidades que dá para conferir (dezenas) e as regras de cada uma. */
  modalities() {
    return ['megasena', 'lotofacil', 'quina', 'lotomania', 'duplasena', 'timemania', 'diadesorte']
      .map((key) => getLotteryRule(key))
      .filter((rule): rule is NonNullable<typeof rule> => Boolean(rule))
      .map((rule) => ({ modalidade: rule.modalidade, nome: rule.nome, min: rule.min, max: rule.max, minimoDezenas: rule.betMin, maximoDezenas: rule.betMax }));
  }

  async check(input: { modalidade: string; concurso?: number; jogos: number[][] }) {
    const rule = getLotteryRule(input.modalidade);
    if (!rule) throw new BadRequestException('Escolha uma modalidade de dezenas: Mega-Sena, Lotofácil, Quina, Lotomania, Dupla Sena, Timemania ou Dia de Sorte.');
    if (!input.jogos.length) throw new BadRequestException('Informe pelo menos um jogo.');
    if (input.jogos.length > MAX_GAMES_PER_CHECK) throw new BadRequestException(`Confira até ${MAX_GAMES_PER_CHECK} jogos por vez.`);
    const contest = await this.prisma.concurso.findFirst({
      where: { modalidade: input.modalidade, resultado: { isNot: null }, ...(input.concurso ? { numeroConcurso: input.concurso } : {}) },
      orderBy: input.concurso ? undefined : { dataSorteio: 'desc' },
      select: { numeroConcurso: true, dataSorteio: true, nomeEspecial: true, resultado: { select: { numerosSorteados: true, numerosSegundoSorteio: true, listaRateioPremio: true } } },
    });
    if (!contest?.resultado) throw new NotFoundException(input.concurso ? `O concurso ${input.concurso} ainda não tem resultado aqui.` : 'Ainda não há resultado carregado para esta modalidade.');
    const tiers = Array.isArray(contest.resultado.listaRateioPremio) ? (contest.resultado.listaRateioPremio as unknown as SettlementTier[]) : [];
    return {
      modalidade: input.modalidade,
      nome: rule.nome,
      concurso: contest.numeroConcurso,
      dataSorteio: contest.dataSorteio,
      especial: contest.nomeEspecial ?? null,
      numerosSorteados: contest.resultado.numerosSorteados,
      numerosSegundoSorteio: contest.resultado.numerosSegundoSorteio,
      jogos: conferirJogos(input.modalidade, input.jogos, contest.resultado.numerosSorteados, contest.resultado.numerosSegundoSorteio, tiers),
      aviso: input.modalidade === 'timemania' || input.modalidade === 'diadesorte' ? 'A conferência considera só as dezenas. O Time do Coração e o Mês de Sorte não entram aqui.' : null,
    };
  }
}
