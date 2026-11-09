import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatusCota } from '@prisma/client';
import { AuthUser } from '../auth/auth.utils';
import { round2 } from '../common/brazil-time';
import { PrismaService } from '../common/prisma.service';
import { AffiliateCrmProfileDto, CrmListQueryDto } from './crm.dto';
import { BettorRow, CrmService } from './crm.service';
import { buildFunnel, ETAPA_LABELS } from './crm.segments';

const PAID: StatusCota[] = [StatusCota.paga, StatusCota.registrada, StatusCota.apurada, StatusCota.premiada];

const maskEmail = (email: string) => { const [user, domain] = email.split('@'); return `${(user ?? '').slice(0, 2)}***@${domain ?? ''}`; };

/**
 * CRM do afiliado: só os clientes DELE (indicados pelo link, membros dos grupos dele e quem comprou nos bolões dele),
 * com a esteira de venda de cada um. Não mostra CPF nem as anotações da administração.
 */
@Injectable()
export class AffiliateCrmService {
  constructor(private readonly prisma: PrismaService, private readonly crm: CrmService) {}

  private async scope(user: AuthUser) {
    const affiliate = await this.prisma.afiliado.findUnique({ where: { usuarioId: user.id }, select: { id: true, statusAprovacao: true } });
    if (!affiliate || affiliate.statusAprovacao !== 'aprovado') throw new ForbiddenException('A área de afiliado exige um cadastro aprovado.');
    const cotaScope: Prisma.CotaWhereInput = { OR: [{ afiliadoReferenciaId: affiliate.id }, { bolao: { criadoPor: user.id } }] };
    const userWhere: Prisma.UsuarioWhereInput = { OR: [{ indicadoPorAfiliadoId: affiliate.id }, { gruposMembro: { some: { grupo: { afiliadoId: affiliate.id } } } }, { cotasCompradas: { some: cotaScope } }] };
    return { affiliateId: affiliate.id, cotaScope, userWhere };
  }

  private async clients(user: AuthUser) {
    const scope = await this.scope(user);
    const [rows, profiles] = await Promise.all([
      this.crm.rows(false, { userWhere: scope.userWhere, cotaScope: scope.cotaScope, hideAdminProfile: true }),
      this.prisma.crmAfiliadoPerfil.findMany({ where: { afiliadoId: scope.affiliateId } }),
    ]);
    const byUser = new Map(profiles.map((profile) => [profile.usuarioId, profile]));
    const items = rows.map((row) => {
      const profile = byUser.get(row.id);
      return { ...row, etiquetas: profile?.etiquetas ?? [], proximoContatoEm: profile?.proximoContatoEm ?? null, nota: profile?.nota ?? null };
    });
    return { ...scope, items };
  }

  private publicRow(row: BettorRow & { nota: string | null }) {
    const { cpf: _cpf, afiliadoOrigem: _origin, papel: _role, email, ...rest } = row;
    return { ...rest, email: maskEmail(email) };
  }

  async overview(user: AuthUser) {
    const { items } = await this.clients(user);
    const buyers = items.filter((row) => row.compras > 0);
    const revenue = round2(buyers.reduce((sum, row) => sum + row.totalGasto, 0));
    const followUps = items.filter((row) => row.proximoContatoEm && row.proximoContatoEm.getTime() <= Date.now() + 7 * 86_400_000).sort((a, b) => a.proximoContatoEm!.getTime() - b.proximoContatoEm!.getTime()).slice(0, 10).map((row) => ({ id: row.id, nome: row.nome, telefone: row.telefone, etapaNome: row.etapaNome, proximoContatoEm: row.proximoContatoEm }));
    const toContact = items.filter((row) => ['reservou', 'reserva_vencida', 'inativo'].includes(row.etapa)).sort((a, b) => b.valorPendente - a.valorPendente || b.totalGasto - a.totalGasto).slice(0, 10).map((row) => ({ id: row.id, nome: row.nome, telefone: row.telefone, etapa: row.etapa, etapaNome: row.etapaNome, proximaAcao: row.proximaAcao, valorPendente: row.valorPendente }));
    return {
      totais: { clientes: items.length, compradores: buyers.length, receitaTotal: revenue, ticketMedio: buyers.length ? round2(revenue / buyers.length) : 0, valorPendente: round2(items.reduce((sum, row) => sum + row.valorPendente, 0)) },
      funil: buildFunnel(items),
      acompanhamentos: followUps,
      paraChamarAgora: toContact,
    };
  }

  async list(query: CrmListQueryDto, user: AuthUser) {
    const { items } = await this.clients(user);
    const rows = this.crm.filtered(items, query) as typeof items;
    const pageSize = query.porPagina ?? 25;
    const page = Math.max(query.pagina ?? 1, 1);
    return { items: rows.slice((page - 1) * pageSize, page * pageSize).map((row) => this.publicRow(row)), total: rows.length, pagina: page, paginas: Math.max(Math.ceil(rows.length / pageSize), 1) };
  }

  async detail(usuarioId: string, user: AuthUser) {
    const { items, cotaScope } = await this.clients(user);
    const row = items.find((item) => item.id === usuarioId);
    if (!row) throw new NotFoundException('Cliente não encontrado na sua carteira.');
    const shares = await this.prisma.cota.findMany({
      where: { compradorId: usuarioId, ...cotaScope }, orderBy: { criadoEm: 'desc' }, take: 100,
      select: { id: true, quantidade: true, status: true, criadoEm: true, valorPago: true, valorPremio: true, expiraReservaEm: true, bolao: { select: { id: true, valorCota: true, concurso: { select: { modalidade: true, numeroConcurso: true } } } }, pagamento: { select: { status: true, confirmadoEm: true } } },
    });
    return {
      cliente: this.publicRow(row),
      historico: shares.map((share) => ({
        id: share.id, criadoEm: share.criadoEm, modalidade: share.bolao.concurso.modalidade, concurso: share.bolao.concurso.numeroConcurso, bolaoId: share.bolao.id, quantidade: share.quantidade, status: share.status,
        valor: Number(share.valorPago ?? Number(share.bolao.valorCota) * share.quantidade), pago: PAID.includes(share.status), reservaExpiraEm: share.status === StatusCota.reservada ? share.expiraReservaEm : null,
        pagamentoConfirmadoEm: share.pagamento?.confirmadoEm ?? null, premio: share.valorPremio ? Number(share.valorPremio) : null,
      })),
      etapas: ETAPA_LABELS,
    };
  }

  async updateProfile(usuarioId: string, dto: AffiliateCrmProfileDto, user: AuthUser) {
    const { affiliateId, items } = await this.clients(user);
    if (!items.some((item) => item.id === usuarioId)) throw new NotFoundException('Cliente não encontrado na sua carteira.');
    const etiquetas = dto.etiquetas ? [...new Set(dto.etiquetas.map((tag) => tag.trim().toLowerCase()).filter(Boolean))] : undefined;
    const data = {
      ...(etiquetas ? { etiquetas } : {}),
      ...(dto.nota !== undefined ? { nota: dto.nota === null ? null : dto.nota.trim() || null } : {}),
      ...(dto.proximoContatoEm !== undefined ? { proximoContatoEm: dto.proximoContatoEm === null ? null : new Date(dto.proximoContatoEm) } : {}),
    };
    const profile = await this.prisma.crmAfiliadoPerfil.upsert({ where: { afiliadoId_usuarioId: { afiliadoId: affiliateId, usuarioId } }, create: { afiliadoId: affiliateId, usuarioId, ...data }, update: data });
    return { etiquetas: profile.etiquetas, nota: profile.nota, proximoContatoEm: profile.proximoContatoEm };
  }
}
