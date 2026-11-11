import { BadRequestException, ConflictException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma, StatusBolao, StatusCota } from '@prisma/client';
import { hasSaleProof } from '../attachments/proof';
import { AuthUser } from '../auth/auth.utils';
import { joinGroup } from '../common/affiliate-groups';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { destinationBlocker, freeSlots, gamesSignature, planTransfer, sourceBlocker, type TransferPool } from './pool-transfer';

export interface TransferInput {
  destinoBolaoId: string;
  cotaIds?: string[];
  motivo?: string;
  confirmarJogosDiferentes?: boolean;
  simular?: boolean;
}

const poolInclude = {
  concurso: { select: { id: true, modalidade: true, numeroConcurso: true, dataSorteio: true, status: true, resultado: { select: { id: true } } } },
  grupo: { select: { id: true, nome: true, tipo: true } },
  jogos: { orderBy: { ordem: 'asc' as const }, select: { numeros: true } },
  criador: { select: { id: true, nome: true, papel: true } },
} satisfies Prisma.BolaoInclude;

/**
 * Transferência de cotistas entre bolões do mesmo concurso (ex.: o afiliado não vendeu o bastante e a BL junta as
 * pessoas em outro bolão). Só move cota JÁ PAGA; reservas ainda sem pagamento ficam onde estão e vencem sozinhas.
 * Tudo acontece numa única transação, com os dois bolões travados, e qualquer falha desfaz o conjunto.
 */
@Injectable()
export class PoolTransferService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, @Optional() private readonly notifications?: NotificationsService) {}

  private asPool(pool: Prisma.BolaoGetPayload<{ include: typeof poolInclude }>): TransferPool {
    return { id: pool.id, status: pool.status, concursoId: pool.concursoId, valorCota: pool.valorCota, taxaAdministracaoPct: pool.taxaAdministracaoPct, totalCotas: pool.totalCotas, cotasIlimitadas: pool.cotasIlimitadas, cotasVendidas: pool.cotasVendidas, maxCotasPorPessoa: pool.maxCotasPorPessoa, jogos: pool.jogos, concurso: pool.concurso };
  }

  /** Bolões que podem receber os cotistas deste e as pessoas (cotas pagas) que podem sair. */
  async options(sourceId: string) {
    const source = await this.prisma.bolao.findUnique({ where: { id: sourceId }, include: poolInclude });
    if (!source) throw new NotFoundException('Bolão não encontrado.');
    const blocked = sourceBlocker(this.asPool(source));
    const shares = await this.prisma.cota.findMany({ where: { bolaoId: sourceId, status: StatusCota.paga }, select: { id: true, quantidade: true, titularNome: true, compradorId: true, comprador: { select: { nome: true } } }, orderBy: { criadoEm: 'asc' } });
    const reservadas = await this.prisma.cota.count({ where: { bolaoId: sourceId, status: StatusCota.reservada, expiraReservaEm: { gt: new Date() } } });
    const candidates = blocked ? [] : await this.prisma.bolao.findMany({
      where: { id: { not: sourceId }, concursoId: source.concursoId, valorCota: source.valorCota, taxaAdministracaoPct: source.taxaAdministracaoPct, status: { in: [StatusBolao.aberto, StatusBolao.fechado] } },
      include: poolInclude, orderBy: { criadoEm: 'desc' }, take: 50,
    });
    const sourcePool = this.asPool(source);
    const destinos = candidates
      .filter((candidate) => !destinationBlocker(sourcePool, this.asPool(candidate)))
      .map((candidate) => ({ id: candidate.id, grupo: candidate.grupo.nome, grupoTipo: candidate.grupo.tipo, criador: candidate.criador.nome, status: candidate.status, livres: freeSlots(this.asPool(candidate)), ilimitado: candidate.cotasIlimitadas, maxPorPessoa: candidate.maxCotasPorPessoa, jogosIguais: gamesSignature(candidate.jogos) === gamesSignature(source.jogos), jogos: candidate.jogos.length }));
    return {
      origem: { id: source.id, grupo: source.grupo.nome, status: source.status, modalidade: source.concurso.modalidade, numeroConcurso: source.concurso.numeroConcurso, jogos: source.jogos.length },
      bloqueio: blocked,
      cotistas: shares.map((share) => ({ cotaId: share.id, nome: share.titularNome || share.comprador.nome, quantidade: share.quantidade })),
      reservasEmAberto: reservadas,
      destinos,
    };
  }

  async transfer(sourceId: string, input: TransferInput, user: AuthUser) {
    if (sourceId === input.destinoBolaoId) throw new BadRequestException('Escolha um bolão diferente do que está de saída.');
    const reason = (input.motivo ?? '').trim();
    if (!input.simular && reason.length < 3) throw new BadRequestException('Conte o motivo da transferência (mínimo de 3 letras). Fica registrado.');
    const cotaIds = input.cotaIds?.length ? [...new Set(input.cotaIds)] : undefined;
    return this.prisma.$transaction(async (tx) => {
      // Trava os dois bolões sempre na mesma ordem (sem impasse entre duas transferências ao mesmo tempo).
      const ordered = [sourceId, input.destinoBolaoId].sort();
      await tx.$queryRaw`SELECT id FROM boloes WHERE id IN (${ordered[0]}::uuid, ${ordered[1]}::uuid) ORDER BY id FOR UPDATE`;
      const [source, dest] = await Promise.all([
        tx.bolao.findUnique({ where: { id: sourceId }, include: poolInclude }),
        tx.bolao.findUnique({ where: { id: input.destinoBolaoId }, include: poolInclude }),
      ]);
      if (!source) throw new NotFoundException('Bolão de origem não encontrado.');
      if (!dest) throw new NotFoundException('Bolão de destino não encontrado.');
      const shares = await tx.cota.findMany({ where: { bolaoId: sourceId, status: StatusCota.paga, ...(cotaIds ? { id: { in: cotaIds } } : {}) }, select: { id: true, compradorId: true, quantidade: true, titularNome: true }, orderBy: { criadoEm: 'asc' } });
      if (cotaIds && shares.length !== cotaIds.length) throw new ConflictException('Alguma das cotas escolhidas não está mais paga neste bolão. Atualize a tela e confira de novo.');
      const now = new Date();
      const buyers = [...new Set(shares.map((share) => share.compradorId))];
      const held = await tx.cota.groupBy({ by: ['compradorId'], where: { bolaoId: dest.id, compradorId: { in: buyers }, OR: [{ status: { in: [StatusCota.paga, StatusCota.registrada, StatusCota.apurada, StatusCota.premiada] } }, { status: StatusCota.reservada, expiraReservaEm: { gt: now } }] }, _sum: { quantidade: true } });
      const heldInDest = new Map(held.map((row) => [row.compradorId, row._sum.quantidade ?? 0]));
      const plan = planTransfer({ source: this.asPool(source), dest: this.asPool(dest), shares, heldInDest, confirmarJogosDiferentes: input.confirmarJogosDiferentes, now });
      if (dest.comprovanteAntesVenda && !await hasSaleProof(tx, dest.id)) plan.erros.push('O bolão de destino exige o comprovante oficial antes de receber cotas, e ele ainda não foi enviado.');
      const summary = { cotas: plan.cotas, pessoas: plan.pessoas, avisos: plan.avisos, jogosDiferentes: plan.jogosDiferentes, origem: { id: source.id, grupo: source.grupo.nome }, destino: { id: dest.id, grupo: dest.grupo.nome, livresDepois: freeSlots(this.asPool(dest)) === null ? null : (freeSlots(this.asPool(dest)) as number) - plan.cotas } };
      if (plan.erros.length) {
        if (input.simular) return { ok: false as const, simulacao: true, erros: plan.erros, ...summary };
        throw new ConflictException(plan.erros[0]);
      }
      if (input.simular) return { ok: true as const, simulacao: true, erros: [], ...summary };

      const ids = shares.map((share) => share.id);
      const moved = await tx.cota.updateMany({ where: { id: { in: ids }, bolaoId: source.id, status: StatusCota.paga }, data: { bolaoId: dest.id } });
      if (moved.count !== ids.length) throw new ConflictException('As cotas mudaram durante a transferência. Nada foi alterado; tente de novo.');
      await tx.anexo.updateMany({ where: { cotaId: { in: ids } }, data: { bolaoId: dest.id } });
      const out = await tx.bolao.updateMany({ where: { id: source.id, cotasVendidas: { gte: plan.cotas } }, data: { cotasVendidas: { decrement: plan.cotas } } });
      if (out.count !== 1) throw new ConflictException('A contagem de cotas do bolão de origem não confere. Nada foi alterado.');
      if (dest.cotasIlimitadas) await tx.bolao.update({ where: { id: dest.id }, data: { cotasVendidas: { increment: plan.cotas } } });
      else {
        const into = await tx.bolao.updateMany({ where: { id: dest.id, cotasVendidas: { lte: (dest.totalCotas ?? 0) - plan.cotas } }, data: { cotasVendidas: { increment: plan.cotas } } });
        if (into.count !== 1) throw new ConflictException('O bolão de destino ficou sem espaço. Nada foi alterado.');
      }
      // As pessoas passam a fazer parte do grupo do bolão de destino (ou do grupo oficial que assumiu as cotas dele).
      const targetGroupId = dest.ofertaBlGrupoId ?? dest.grupoId;
      for (const buyer of buyers) await joinGroup(tx, targetGroupId, buyer);

      const details = { motivo: reason, cotas: plan.cotas, pessoas: plan.pessoas, cotaIds: ids, jogosDiferentes: plan.jogosDiferentes };
      for (const share of shares) await this.audit.record(tx, { entidade: 'cota', entidadeId: share.id, evento: 'cota.transferida', atorId: user.id, payloadAntes: { bolaoId: source.id } as Prisma.InputJsonValue, payloadDepois: { bolaoId: dest.id, motivo: reason } as Prisma.InputJsonValue });
      await this.audit.record(tx, { entidade: 'bolao', entidadeId: source.id, evento: 'bolao.cotas_transferidas_saida', atorId: user.id, payloadDepois: { ...details, destinoBolaoId: dest.id } as Prisma.InputJsonValue });
      await this.audit.record(tx, { entidade: 'bolao', entidadeId: dest.id, evento: 'bolao.cotas_transferidas_entrada', atorId: user.id, payloadDepois: { ...details, origemBolaoId: source.id } as Prisma.InputJsonValue });

      const label = `${source.concurso.modalidade} #${source.concurso.numeroConcurso}`;
      for (const buyer of buyers) await tx.notificacao.create({ data: { usuarioId: buyer, canal: 'push', tipo: 'cota.transferida', payload: { titulo: 'Sua cota mudou de bolão', mensagem: `Sua cota do concurso #${source.concurso.numeroConcurso} agora está no grupo ${dest.grupo.nome}. Mesmo sorteio, mesmo valor: não precisa fazer nada.`, link: '/minha-conta', bolaoId: dest.id } } });
      const owners = new Set<string>([source.criadoPor, dest.criadoPor].filter((id) => id !== user.id));
      for (const owner of owners) await tx.notificacao.create({ data: { usuarioId: owner, canal: 'push', tipo: 'cota.transferida', payload: { titulo: 'A BL moveu cotas entre bolões', mensagem: `${plan.cotas} cota(s) do ${label} foram transferidas do grupo ${source.grupo.nome} para o grupo ${dest.grupo.nome}.`, link: '/afiliado', semEmail: true } } });
      return { ok: true as const, simulacao: false, erros: [], ...summary };
    }, { timeout: 30_000 });
  }
}
