import { ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma, StatusComissao } from '@prisma/client';
import { AuthUser } from '../auth/auth.utils';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { ApproveAffiliateDto, CreateAffiliateDto, CreatePartnerLotteryDto } from './admin.dto';

@Injectable()
export class AdminService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async createPartner(dto: CreatePartnerLotteryDto, user: AuthUser) {
    const exists = await this.prisma.lotericaParceira.findUnique({ where: { cnpj: dto.cnpj.replace(/\D/g, '') } });
    if (exists) throw new ConflictException('CNPJ já cadastrado.');
    const partner = await this.prisma.lotericaParceira.create({ data: { razaoSocial: dto.razaoSocial, cnpj: dto.cnpj.replace(/\D/g, ''), codigoCaixa: dto.codigoCaixa, cidade: dto.cidade, uf: dto.uf.toUpperCase(), percentualRepasse: new Prisma.Decimal(dto.percentualRepasse), usuarioOperacionalId: dto.usuarioOperacionalId } });
    await this.audit.record(this.prisma, { entidade: 'loterica_parceira', entidadeId: partner.id, evento: 'loterica.criada', atorId: user.id, payloadDepois: partner as unknown as Prisma.InputJsonValue });
    return partner;
  }

  async requestAffiliate(user: AuthUser, dto: CreateAffiliateDto) {
    const existing = await this.prisma.afiliado.findUnique({ where: { usuarioId: user.id } });
    if (existing) throw new ConflictException('Solicitação de afiliado já existe.');
    const affiliate = await this.prisma.afiliado.create({ data: { usuarioId: user.id, codigoAfiliado: `af-${user.id.slice(0, 8)}` } });
    await this.audit.record(this.prisma, { entidade: 'afiliado', entidadeId: affiliate.id, evento: 'afiliado.solicitado', atorId: user.id, payloadDepois: { contato: dto.emailContato ?? null } });
    return affiliate;
  }

  async approveAffiliate(id: string, dto: ApproveAffiliateDto, user: AuthUser) {
    const affiliate = await this.prisma.afiliado.findUnique({ where: { id } });
    if (!affiliate) throw new NotFoundException('Afiliado não encontrado.');
    const updated = await this.prisma.afiliado.update({ where: { id }, data: { statusAprovacao: 'aprovado', comissaoPadraoPct: new Prisma.Decimal(dto.comissaoPadraoPct), aprovadoPor: user.id, aprovadoEm: new Date() } });
    await this.audit.record(this.prisma, { entidade: 'afiliado', entidadeId: id, evento: 'afiliado.aprovado', atorId: user.id, payloadAntes: affiliate as unknown as Prisma.InputJsonValue, payloadDepois: updated as unknown as Prisma.InputJsonValue });
    return updated;
  }

  async affiliateDashboard(user: AuthUser) {
    const affiliate = await this.prisma.afiliado.findUnique({ where: { usuarioId: user.id }, include: { comissoes: true } });
    if (!affiliate) throw new NotFoundException('Usuário ainda não possui cadastro de afiliado.');
    const pending = affiliate.comissoes.filter((commission) => commission.status === StatusComissao.pendente).reduce((sum, commission) => sum + Number(commission.valor), 0);
    const paid = affiliate.comissoes.filter((commission) => commission.status === StatusComissao.paga).reduce((sum, commission) => sum + Number(commission.valor), 0);
    return { codigoAfiliado: affiliate.codigoAfiliado, statusAprovacao: affiliate.statusAprovacao, comissaoPendente: pending.toFixed(2), comissaoPaga: paid.toFixed(2), totalComissoes: affiliate.comissoes.length };
  }

  async affiliateCommissions(user: AuthUser) {
    const affiliate = await this.prisma.afiliado.findUnique({ where: { usuarioId: user.id } });
    if (!affiliate) throw new NotFoundException('Afiliado não encontrado.');
    return this.prisma.comissao.findMany({ where: { afiliadoId: affiliate.id }, orderBy: { criadoEm: 'desc' }, select: { id: true, cotaId: true, valor: true, status: true, repassadoEm: true, criadoEm: true } });
  }

  async financialReconciliation(user: AuthUser) {
    const payments = await this.prisma.pagamento.findMany({ where: { status: 'confirmado' }, select: { valorBruto: true, valorTaxaAdmin: true, valorCustoBilhete: true, valorComissaoAfiliado: true } });
    const totals = payments.reduce((acc, payment) => ({ gross: acc.gross + Number(payment.valorBruto), fees: acc.fees + Number(payment.valorTaxaAdmin), cost: acc.cost + Number(payment.valorCustoBilhete), commissions: acc.commissions + Number(payment.valorComissaoAfiliado) }), { gross: 0, fees: 0, cost: 0, commissions: 0 });
    await this.audit.record(this.prisma, { entidade: 'financeiro', entidadeId: user.id, evento: 'financeiro.consultado', atorId: user.id, payloadDepois: totals });
    return { valorArrecadado: totals.gross.toFixed(2), taxaAdministracao: totals.fees.toFixed(2), custoBilhetes: totals.cost.toFixed(2), comissoes: totals.commissions.toFixed(2), conciliado: Math.abs(totals.gross - totals.cost - totals.fees) < 0.01 };
  }
}
