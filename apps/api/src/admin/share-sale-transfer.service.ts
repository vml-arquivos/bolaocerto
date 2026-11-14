import { ConflictException, ForbiddenException, Injectable, NotFoundException, Optional } from '@nestjs/common';
import { Prisma, StatusComissao, StatusCota, StatusPagamento } from '@prisma/client';
import { AuthUser } from '../auth/auth.utils';
import { AuditService } from '../common/audit.service';
import { round2 } from '../common/brazil-time';
import { PrismaService } from '../common/prisma.service';
import { NotificationsService } from '../notifications/notifications.service';
import { isSuperAdmin, ownsAffiliate } from './superadmin';

const SOLD: StatusCota[] = [StatusCota.paga, StatusCota.registrada, StatusCota.apurada, StatusCota.premiada];
const TRANSFERABLE: StatusCota[] = [...SOLD, StatusCota.reservada];

/**
 * Transferir a venda de uma cota: define qual afiliado fez a venda (ou "venda direta", sem afiliado).
 * A comissão vai junto: é recalculada com o percentual do novo afiliado sobre a mesma taxa de administração da cota.
 * Comissão já paga (ou em lote de pagamento) não muda, para nunca pagar duas vezes.
 */
@Injectable()
export class ShareSaleTransferService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, @Optional() private readonly notifications?: NotificationsService) {}

  async transfer(cotaId: string, input: { afiliadoId: string | null; motivo?: string }, actor: AuthUser) {
    const share = await this.prisma.cota.findUnique({
      where: { id: cotaId },
      include: {
        pagamento: true,
        comissao: true,
        afiliadoReferencia: { select: { id: true, aprovadoPor: true, codigoAfiliado: true, usuarioId: true, usuario: { select: { nome: true } } } },
        bolao: { select: { id: true, concurso: { select: { modalidade: true, numeroConcurso: true } } } },
      },
    });
    if (!share) throw new NotFoundException('Cota não encontrada.');
    if (!TRANSFERABLE.includes(share.status)) throw new ConflictException('Só dá para transferir a venda de cota paga ou reservada. Esta cota foi cancelada ou estornada.');
    const targetId = input.afiliadoId || null;
    if ((share.afiliadoReferenciaId ?? null) === targetId) throw new ConflictException(targetId ? 'Esta venda já é deste afiliado.' : 'Esta venda já está como venda direta (sem afiliado).');

    const target = targetId
      ? await this.prisma.afiliado.findUnique({ where: { id: targetId }, select: { id: true, statusAprovacao: true, aprovadoPor: true, comissaoPadraoPct: true, codigoAfiliado: true, usuarioId: true, usuario: { select: { nome: true } } } })
      : null;
    if (targetId && (!target || target.statusAprovacao !== 'aprovado')) throw new NotFoundException('Afiliado aprovado não encontrado.');

    // Administrador comum só mexe entre os afiliados que ele trouxe; a conta principal mexe em qualquer um.
    if (!isSuperAdmin(actor)) {
      if (share.afiliadoReferencia && !ownsAffiliate(actor, share.afiliadoReferencia.aprovadoPor)) throw new ForbiddenException('Esta venda é de um afiliado trazido por outro administrador. Só a conta principal pode transferir.');
      if (target && !ownsAffiliate(actor, target.aprovadoPor)) throw new ForbiddenException('Você só pode passar a venda para afiliados que você trouxe. A conta principal pode passar para qualquer um.');
    }

    const commission = share.comissao;
    if (commission && commission.status === StatusComissao.paga) throw new ConflictException(`A comissão desta cota já foi paga a ${share.afiliadoReferencia?.usuario.nome ?? 'outro afiliado'}. Para não pagar duas vezes, a venda não pode ser transferida.`);
    if (commission && commission.status === StatusComissao.pendente && commission.loteRepasseId) throw new ConflictException('A comissão desta cota está num lote de pagamento em andamento. Tire do lote antes de transferir.');

    const payment = share.pagamento;
    const base = payment ? Number(payment.valorTaxaAdmin) : 0;
    const pct = target ? Number(target.comissaoPadraoPct) : 0;
    const value = target ? round2(base * (pct / 100)) : 0;
    const sold = SOLD.includes(share.status) && payment?.status === StatusPagamento.confirmado;
    const reason = input.motivo?.trim().slice(0, 300) || null;

    const before = { afiliadoId: share.afiliadoReferenciaId, comissao: commission ? { afiliadoId: commission.afiliadoId, valor: commission.valor.toFixed(2), status: commission.status } : null, valorComissaoPagamento: payment?.valorComissaoAfiliado.toFixed(2) ?? null };
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.cota.update({ where: { id: share.id }, data: { afiliadoReferenciaId: targetId } });
      // O valor da comissão no pagamento acompanha o novo afiliado (vale também para a reserva que ainda vai ser paga).
      if (payment) await tx.pagamento.update({ where: { id: payment.id }, data: { valorComissaoAfiliado: new Prisma.Decimal(value) } });
      let after: { afiliadoId: string; valor: string; status: StatusComissao } | null = null;
      if (sold) {
        const note = `Venda transferida${reason ? `: ${reason}` : ''}`;
        if (target && value > 0) {
          const data = { afiliadoId: target.id, valor: new Prisma.Decimal(value), baseCalculo: new Prisma.Decimal(base), percentual: new Prisma.Decimal(round2(pct)), status: StatusComissao.pendente, observacao: note };
          const saved = commission
            ? await tx.comissao.update({ where: { id: commission.id }, data })
            : await tx.comissao.create({ data: { ...data, cotaId: share.id } });
          after = { afiliadoId: saved.afiliadoId, valor: saved.valor.toFixed(2), status: saved.status };
        } else if (commission && commission.status === StatusComissao.pendente) {
          // Venda direta (ou afiliado com 0%): a comissão que existia deixa de valer.
          const saved = await tx.comissao.update({ where: { id: commission.id }, data: { status: StatusComissao.cancelada, observacao: note } });
          after = { afiliadoId: saved.afiliadoId, valor: saved.valor.toFixed(2), status: saved.status };
        }
      }
      await this.audit.record(tx, { entidade: 'cota', entidadeId: share.id, evento: 'cota.venda_transferida', atorId: actor.id, payloadAntes: before as Prisma.InputJsonValue, payloadDepois: { afiliadoId: targetId, comissao: after, valorComissaoPagamento: payment ? value.toFixed(2) : null, motivo: reason } as Prisma.InputJsonValue });
      return after;
    });

    const pool = `${share.bolao.concurso.modalidade} #${share.bolao.concurso.numeroConcurso}`;
    const money = (amount: number) => amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
    if (target) await this.notifications?.notify(target.usuarioId, 'venda.transferida', { titulo: 'Venda atribuída a você', mensagem: `A equipe do BL passou para você a venda de ${share.quantidade} ${share.quantidade === 1 ? 'cota' : 'cotas'} do bolão ${pool}${sold && value > 0 ? `, com comissão de ${money(value)}` : ''}.`, link: '/afiliado?aba=comissoes', semEmail: true }).catch(() => undefined);
    if (share.afiliadoReferencia) await this.notifications?.notify(share.afiliadoReferencia.usuarioId, 'venda.transferida', { titulo: 'Venda transferida', mensagem: `A equipe do BL transferiu a venda de ${share.quantidade} ${share.quantidade === 1 ? 'cota' : 'cotas'} do bolão ${pool} para ${target ? 'outro afiliado' : 'venda direta'}.`, link: '/afiliado?aba=comissoes', semEmail: true }).catch(() => undefined);

    return {
      cotaId: share.id,
      afiliado: target ? { id: target.id, nome: target.usuario.nome, codigo: target.codigoAfiliado } : null,
      comissao: result,
      valorComissao: value.toFixed(2),
      vendaConfirmada: sold,
    };
  }
}

