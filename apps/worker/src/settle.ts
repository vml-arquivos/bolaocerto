import { Prisma, PrismaClient } from '@prisma/client';
import { CaixaPrizeTier, settleGames, splitPrize, supportsAutoSettlement } from '@bolaocerto/shared-types';
import { sendAlert } from './alert';

const ACTIVE_SHARE = ['registrada'];

/**
 * Apura os bolões REGISTRADOS do concurso: confere cada jogo (inclusive o 2º sorteio da Dupla Sena),
 * soma os prêmios e divide entre as cotas em centavos exatos. Guarda o detalhe por jogo para a página pública do bolão.
 */
export async function apurarConcurso(prisma: PrismaClient, concursoId: string, modality: string, contestNumber: number, numbers: number[], secondDraw: number[], tiers: CaixaPrizeTier[]): Promise<void> {
  const pools = await prisma.bolao.findMany({ where: { concursoId, status: 'registrado' }, include: { cotas: true, jogos: { where: { status: 'ativo' }, orderBy: { ordem: 'asc' } } } });
  for (const pool of pools) {
    if (!supportsAutoSettlement(modality)) {
      console.warn(JSON.stringify({ event: 'apuracao.manual_necessaria', modalidade: modality, bolaoId: pool.id, motivo: 'modalidade sem apuração automática' }));
      await sendAlert(`manual:${pool.id}`, `Apuração MANUAL necessária: bolão ${modality} #${contestNumber} (${pool.id}). Esta modalidade não é conferida automaticamente.`, 12 * 3_600_000);
      continue;
    }
    const games = pool.jogos.length ? pool.jogos.map((game) => ({ ordem: game.ordem, numeros: game.numeros })) : [{ ordem: 1, numeros: pool.numerosApostados }];
    const result = settleGames({ games, drawn: numbers, secondDraw, tiers });
    const active = pool.cotas.filter((share) => ACTIVE_SHARE.includes(share.status));
    const parts = splitPrize(result.premioTotal, active.map((share) => ({ id: share.id, quantidade: share.quantidade })));
    const tierNames = [...new Set(result.jogos.flatMap((game) => game.premios.map((prize) => prize.faixa)))].join(' + ') || null;
    await prisma.$transaction(async (tx) => {
      await tx.bolao.update({ where: { id: pool.id }, data: { status: 'apurado', teveGanhador: result.teveGanhador, premioTotal: result.premioTotal, apuradoEm: new Date(), apuracao: { concurso: contestNumber, sorteados: numbers, segundoSorteio: secondDraw, melhorFaixa: result.melhorFaixa, jogos: result.jogos } as unknown as Prisma.InputJsonValue } });
      for (const share of active) {
        const prizeValue = result.teveGanhador ? (parts.get(share.id) ?? 0) : null;
        const status = result.teveGanhador ? 'premiada' : 'apurada';
        await tx.cota.update({ where: { id: share.id }, data: { status, faixaPremio: result.teveGanhador ? tierNames?.slice(0, 60) ?? null : null, valorPremio: prizeValue } });
        await tx.auditoriaEvento.create({ data: { entidade: 'cota', entidadeId: share.id, evento: result.teveGanhador ? 'cota.premiada' : 'cota.apurada', payloadDepois: { status, faixaPremio: tierNames, valorPremio: prizeValue } } });
      }
      for (const usuarioId of new Set(active.map((share) => share.compradorId))) {
        await tx.notificacao.create({ data: result.teveGanhador
          ? { usuarioId, canal: 'push', tipo: 'cota.premiada', payload: { bolaoId: pool.id, mensagem: 'Você possui uma cota premiada! Acesse sua conta para ver o valor e como resgatar. O prazo para resgatar na CAIXA é de 90 dias após o sorteio.' } }
          : { usuarioId, canal: 'push', tipo: 'bolao.apurado', payload: { bolaoId: pool.id, concurso: contestNumber, modalidade: modality, mensagem: 'O concurso foi apurado e o seu bolão não teve prêmio desta vez. Veja a conferência jogo a jogo na página do bolão.' } } });
      }
      await tx.auditoriaEvento.create({ data: { entidade: 'bolao', entidadeId: pool.id, evento: 'resultado.apurado', payloadDepois: { teveGanhador: result.teveGanhador, premioTotal: result.premioTotal, melhorFaixa: result.melhorFaixa, jogos: result.jogos.map((game) => ({ ordem: game.ordem, acertos: game.acertos, total: game.total })) } } });
    });
    if (result.teveGanhador) await sendAlert(`premio:${pool.id}`, `Bolão PREMIADO! ${modality} #${contestNumber} — prêmio bruto total R$ ${result.premioTotal.toFixed(2)} (${tierNames ?? 'faixa'}). Cotas notificadas; confira os repasses.`, 24 * 3_600_000);
  }
}

