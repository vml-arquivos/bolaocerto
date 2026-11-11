import { randomBytes } from 'node:crypto';
import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma, StatusBolao, StatusCota } from '@prisma/client';
import { AuthUser } from '../auth/auth.utils';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';

const SOLD: StatusCota[] = [StatusCota.paga, StatusCota.registrada, StatusCota.apurada, StatusCota.premiada];
const STAFF = ['admin', 'operacao'];

export const distributionPath = (codigo: string) => `/bolao-afiliado/${codigo}`;
export const newDistributionCode = () => randomBytes(9).toString('base64url');

/**
 * Distribuição de bolão para afiliados. A equipe (administrador ou operação) gera um link do bolão; cada afiliado que abre o
 * link com a conta dele passa a ter o bolão no painel para vender. As cotas são as mesmas para todos (acabou, acabou) e a venda
 * de cada afiliado é a que sai com o código dele (cota.afiliadoReferenciaId), por isso o rastreio fecha do envio até quem comprou.
 */
@Injectable()
export class PoolDistributionService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, @Optional() private readonly notifications?: NotificationsService) {}

  private async affiliateOf(user: AuthUser) {
    const affiliate = await this.prisma.afiliado.findUnique({ where: { usuarioId: user.id }, select: { id: true, codigoAfiliado: true, statusAprovacao: true, usuario: { select: { nome: true } } } });
    if (!affiliate || affiliate.statusAprovacao !== 'aprovado') throw new ForbiddenException('Só afiliados aprovados podem receber bolões para vender.');
    return affiliate;
  }

  private async staffPool(poolId: string) {
    const pool = await this.prisma.bolao.findUnique({ where: { id: poolId }, include: { concurso: { select: { modalidade: true, numeroConcurso: true, nomeEspecial: true } }, criador: { select: { id: true, nome: true, papel: true } }, grupo: { select: { nome: true } } } });
    if (!pool) throw new NotFoundException('Bolão não encontrado.');
    return pool;
  }

  /** Gera um link do bolão (geral, ou só para um afiliado escolhido). */
  async createLink(poolId: string, input: { afiliadoId?: string }, actor: AuthUser) {
    const pool = await this.staffPool(poolId);
    if (!STAFF.includes(pool.criador.papel)) throw new BadRequestException('Só bolões criados pela equipe podem ser enviados para afiliados. O bolão de afiliado é vendido pelo próprio afiliado.');
    if (pool.status !== StatusBolao.aberto) throw new ConflictException('Só dá para enviar um bolão que está aberto para venda. Publique o bolão primeiro.');
    let target: { id: string; usuarioId: string; usuario: { nome: string } } | null = null;
    if (input.afiliadoId) {
      target = await this.prisma.afiliado.findFirst({ where: { id: input.afiliadoId, statusAprovacao: 'aprovado' }, select: { id: true, usuarioId: true, usuario: { select: { nome: true } } } });
      if (!target) throw new NotFoundException('Afiliado aprovado não encontrado.');
    }
    const link = await this.prisma.$transaction(async (tx) => {
      const created = await tx.distribuicaoBolao.create({ data: { bolaoId: pool.id, codigo: newDistributionCode(), criadoPor: actor.id, afiliadoAlvoId: target?.id } });
      await this.audit.record(tx, { entidade: 'bolao', entidadeId: pool.id, evento: 'bolao.distribuicao_criada', atorId: actor.id, payloadDepois: { distribuicaoId: created.id, afiliadoAlvoId: target?.id ?? null } as Prisma.InputJsonValue });
      return created;
    });
    const sender = target ? await this.prisma.usuario.findUnique({ where: { id: actor.id }, select: { nome: true } }) : null;
    if (target) await this.notifications?.notify(target.usuarioId, 'bolao.distribuido', { titulo: 'Novo bolão para você vender', mensagem: `${sender?.nome ?? 'A equipe'} enviou um bolão da ${pool.concurso.modalidade}. Abra o link para colocar no seu painel.`, link: distributionPath(link.codigo), semEmail: false });
    return { id: link.id, codigo: link.codigo, caminho: distributionPath(link.codigo), afiliadoAlvoId: link.afiliadoAlvoId };
  }

  /** Painel da equipe: links enviados, afiliados que receberam e o que cada um vendeu (rastreio completo). */
  async overview(poolId: string) {
    const pool = await this.staffPool(poolId);
    const [links, receivers, shares] = await Promise.all([
      this.prisma.distribuicaoBolao.findMany({ where: { bolaoId: poolId }, orderBy: { criadoEm: 'desc' }, include: { criador: { select: { nome: true } }, afiliadoAlvo: { select: { codigoAfiliado: true, usuario: { select: { nome: true } } } }, _count: { select: { recebedores: true } } } }),
      this.prisma.bolaoAfiliado.findMany({ where: { bolaoId: poolId }, orderBy: { aceitoEm: 'asc' }, include: { afiliado: { select: { id: true, codigoAfiliado: true, usuario: { select: { nome: true } } } }, remetente: { select: { nome: true } } } }),
      this.prisma.cota.findMany({ where: { bolaoId: poolId, OR: [{ status: { in: SOLD } }, { status: StatusCota.reservada, expiraReservaEm: { gt: new Date() } }] }, select: { id: true, quantidade: true, status: true, valorPago: true, criadoEm: true, titularNome: true, comprador: { select: { nome: true } }, afiliadoReferencia: { select: { id: true, codigoAfiliado: true, usuario: { select: { nome: true } } } } }, orderBy: { criadoEm: 'desc' }, take: 500 }),
    ]);
    const bySeller = new Map<string, { afiliadoId: string | null; nome: string; codigo: string | null; pagas: number; reservadas: number; valor: number }>();
    for (const share of shares) {
      const key = share.afiliadoReferencia?.id ?? 'direta';
      const row = bySeller.get(key) ?? { afiliadoId: share.afiliadoReferencia?.id ?? null, nome: share.afiliadoReferencia?.usuario.nome ?? 'Venda direta (sem afiliado)', codigo: share.afiliadoReferencia?.codigoAfiliado ?? null, pagas: 0, reservadas: 0, valor: 0 };
      if (share.status === StatusCota.reservada) row.reservadas += share.quantidade;
      else { row.pagas += share.quantidade; row.valor += Number(share.valorPago ?? 0); }
      bySeller.set(key, row);
    }
    for (const receiver of receivers) if (!receiver.removidoEm && !bySeller.has(receiver.afiliadoId)) bySeller.set(receiver.afiliadoId, { afiliadoId: receiver.afiliadoId, nome: receiver.afiliado.usuario.nome, codigo: receiver.afiliado.codigoAfiliado, pagas: 0, reservadas: 0, valor: 0 });
    return {
      bolao: { id: pool.id, criadoPor: pool.criador.nome, grupo: pool.grupo.nome, modalidade: pool.concurso.modalidade, numeroConcurso: pool.concurso.numeroConcurso, status: pool.status, totalCotas: pool.totalCotas, cotasVendidas: pool.cotasVendidas, ilimitado: pool.cotasIlimitadas },
      podeEnviar: STAFF.includes(pool.criador.papel) && pool.status === StatusBolao.aberto,
      links: links.map((link) => ({ id: link.id, codigo: link.codigo, caminho: distributionPath(link.codigo), criadoPor: link.criador.nome, criadoEm: link.criadoEm, revogadoEm: link.revogadoEm, afiliadoAlvo: link.afiliadoAlvo ? { nome: link.afiliadoAlvo.usuario.nome, codigo: link.afiliadoAlvo.codigoAfiliado } : null, aceites: link._count.recebedores })),
      afiliados: receivers.map((receiver) => ({ afiliadoId: receiver.afiliadoId, nome: receiver.afiliado.usuario.nome, codigo: receiver.afiliado.codigoAfiliado, enviadoPor: receiver.remetente.nome, aceitoEm: receiver.aceitoEm, removidoEm: receiver.removidoEm })),
      vendas: [...bySeller.values()].sort((a, b) => b.pagas - a.pagas).map((row) => ({ ...row, valor: row.valor.toFixed(2) })),
      cotas: shares.map((share) => ({ id: share.id, cotista: share.titularNome || share.comprador.nome, quantidade: share.quantidade, status: share.status, criadoEm: share.criadoEm, vendidoPor: share.afiliadoReferencia?.usuario.nome ?? 'Venda direta', codigoAfiliado: share.afiliadoReferencia?.codigoAfiliado ?? null })),
    };
  }

  async revokeLink(poolId: string, linkId: string, actor: AuthUser) {
    const link = await this.prisma.distribuicaoBolao.findFirst({ where: { id: linkId, bolaoId: poolId } });
    if (!link) throw new NotFoundException('Link não encontrado.');
    if (link.revogadoEm) return { id: link.id, revogadoEm: link.revogadoEm };
    return this.prisma.$transaction(async (tx) => {
      const updated = await tx.distribuicaoBolao.update({ where: { id: link.id }, data: { revogadoEm: new Date() } });
      await this.audit.record(tx, { entidade: 'bolao', entidadeId: poolId, evento: 'bolao.distribuicao_revogada', atorId: actor.id, payloadDepois: { distribuicaoId: link.id } as Prisma.InputJsonValue });
      return { id: updated.id, revogadoEm: updated.revogadoEm };
    });
  }

  /** Tira o bolão do painel de um afiliado. As vendas que ele já fez continuam contadas e pagas como estavam. */
  async removeAffiliate(poolId: string, affiliateId: string, actor: AuthUser) {
    const row = await this.prisma.bolaoAfiliado.findUnique({ where: { bolaoId_afiliadoId: { bolaoId: poolId, afiliadoId: affiliateId } } });
    if (!row || row.removidoEm) throw new NotFoundException('Esse afiliado não está com este bolão.');
    await this.prisma.$transaction(async (tx) => {
      await tx.bolaoAfiliado.update({ where: { id: row.id }, data: { removidoEm: new Date(), removidoPor: actor.id } });
      await this.audit.record(tx, { entidade: 'bolao', entidadeId: poolId, evento: 'bolao.distribuicao_removida', atorId: actor.id, payloadDepois: { afiliadoId: affiliateId } as Prisma.InputJsonValue });
    });
    return { ok: true };
  }

  /** Página pública do link: mostra o bolão sem dados pessoais. */
  async preview(codigo: string) {
    const link = await this.prisma.distribuicaoBolao.findUnique({ where: { codigo: codigo.trim().slice(0, 40) }, include: { criador: { select: { nome: true } }, bolao: { include: { concurso: { select: { modalidade: true, numeroConcurso: true, nomeEspecial: true, cutoffAt: true } } } } } });
    if (!link || link.revogadoEm) return { valido: false as const };
    const pool = link.bolao;
    return {
      valido: true as const,
      aberto: pool.status === StatusBolao.aberto,
      direcionado: Boolean(link.afiliadoAlvoId),
      enviadoPor: link.criador.nome.split(' ')[0],
      bolao: { id: pool.id, modalidade: pool.concurso.modalidade, numeroConcurso: pool.concurso.numeroConcurso, nomeEspecial: pool.concurso.nomeEspecial, valorCota: pool.valorCota.toFixed(2), cotasIlimitadas: pool.cotasIlimitadas, cotasDisponiveis: pool.cotasIlimitadas ? null : Math.max((pool.totalCotas ?? 0) - pool.cotasVendidas, 0), encerraEm: pool.vendaFimEm && pool.vendaFimEm < pool.concurso.cutoffAt ? pool.vendaFimEm : pool.concurso.cutoffAt },
    };
  }

  /** O afiliado abriu o link logado: o bolão entra no painel dele (de novo, não duplica). */
  async accept(codigo: string, user: AuthUser) {
    const affiliate = await this.affiliateOf(user);
    const link = await this.prisma.distribuicaoBolao.findUnique({ where: { codigo: codigo.trim().slice(0, 40) }, include: { bolao: { select: { id: true, status: true } } } });
    if (!link || link.revogadoEm) throw new NotFoundException('Este link não vale mais. Peça um novo para a equipe do BL.');
    if (link.afiliadoAlvoId && link.afiliadoAlvoId !== affiliate.id) throw new ForbiddenException('Este link foi enviado para outro afiliado.');
    if (link.bolao.status !== StatusBolao.aberto) throw new ConflictException('Este bolão não está mais aberto para venda.');
    const existing = await this.prisma.bolaoAfiliado.findUnique({ where: { bolaoId_afiliadoId: { bolaoId: link.bolaoId, afiliadoId: affiliate.id } } });
    if (existing && !existing.removidoEm) return { ok: true as const, jaTinha: true, bolaoId: link.bolaoId, linkVenda: `/r/${affiliate.codigoAfiliado}?bolao=${link.bolaoId}` };
    await this.prisma.$transaction(async (tx) => {
      if (existing) await tx.bolaoAfiliado.update({ where: { id: existing.id }, data: { removidoEm: null, removidoPor: null, aceitoEm: new Date(), distribuicaoId: link.id, enviadoPor: link.criadoPor } });
      else await tx.bolaoAfiliado.create({ data: { bolaoId: link.bolaoId, afiliadoId: affiliate.id, distribuicaoId: link.id, enviadoPor: link.criadoPor } });
      await this.audit.record(tx, { entidade: 'bolao', entidadeId: link.bolaoId, evento: 'bolao.distribuicao_aceita', atorId: user.id, payloadDepois: { afiliadoId: affiliate.id, distribuicaoId: link.id, enviadoPor: link.criadoPor } as Prisma.InputJsonValue });
    });
    await this.notifications?.notify(link.criadoPor, 'bolao.distribuicao_aceita', { titulo: 'Afiliado aceitou o bolão', mensagem: `${affiliate.usuario.nome} agora pode vender o bolão que você enviou.`, link: '/admin?view=boloes', semEmail: true });
    return { ok: true as const, jaTinha: false, bolaoId: link.bolaoId, linkVenda: `/r/${affiliate.codigoAfiliado}?bolao=${link.bolaoId}` };
  }

  /** Painel do afiliado: bolões que recebeu, com o que sobra e o quanto ele mesmo vendeu. */
  async received(user: AuthUser) {
    const affiliate = await this.affiliateOf(user);
    const rows = await this.prisma.bolaoAfiliado.findMany({
      where: { afiliadoId: affiliate.id, removidoEm: null, bolao: { status: { in: [StatusBolao.aberto, StatusBolao.fechado, StatusBolao.registrado, StatusBolao.apurado] } } },
      orderBy: { aceitoEm: 'desc' }, take: 100,
      include: { remetente: { select: { nome: true } }, bolao: { include: { concurso: { select: { modalidade: true, numeroConcurso: true, nomeEspecial: true, cutoffAt: true } }, grupo: { select: { nome: true } } } } },
    });
    const mine = rows.length ? await this.prisma.cota.groupBy({ by: ['bolaoId', 'status'], where: { afiliadoReferenciaId: affiliate.id, bolaoId: { in: rows.map((row) => row.bolaoId) }, OR: [{ status: { in: SOLD } }, { status: StatusCota.reservada, expiraReservaEm: { gt: new Date() } }] }, _sum: { quantidade: true } }) : [];
    return {
      items: rows.map((row) => {
        const pool = row.bolao;
        const mineRows = mine.filter((item) => item.bolaoId === pool.id);
        const reservadas = mineRows.filter((item) => item.status === StatusCota.reservada).reduce((sum, item) => sum + (item._sum.quantidade ?? 0), 0);
        const pagas = mineRows.filter((item) => item.status !== StatusCota.reservada).reduce((sum, item) => sum + (item._sum.quantidade ?? 0), 0);
        return {
          bolaoId: pool.id, status: pool.status, modalidade: pool.concurso.modalidade, numeroConcurso: pool.concurso.numeroConcurso, nomeEspecial: pool.concurso.nomeEspecial,
          valorCota: pool.valorCota.toFixed(2), cotasIlimitadas: pool.cotasIlimitadas, totalCotas: pool.totalCotas, cotasVendidasTotal: pool.cotasVendidas,
          cotasDisponiveis: pool.cotasIlimitadas ? null : Math.max((pool.totalCotas ?? 0) - pool.cotasVendidas, 0),
          encerraEm: pool.vendaFimEm && pool.vendaFimEm < pool.concurso.cutoffAt ? pool.vendaFimEm : pool.concurso.cutoffAt,
          recebidoDe: row.remetente.nome, recebidoEm: row.aceitoEm, minhasCotas: { pagas, reservadas },
          linkVenda: `/r/${affiliate.codigoAfiliado}?bolao=${pool.id}`,
        };
      }),
    };
  }
}
