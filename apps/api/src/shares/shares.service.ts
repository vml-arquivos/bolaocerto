import { ConflictException, ForbiddenException, Injectable, NotFoundException, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, StatusBolao, StatusCota } from '@prisma/client';
import { AuthUser, isValidCpf, normalizeCpf } from '../auth/auth.utils';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { ReserveShareDto } from './shares.dto';

@Injectable()
export class SharesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async reserve(dto: ReserveShareDto, user: AuthUser, requestMeta: { ip: string; userAgent?: string }) {
    if (process.env.PAYMENTS_ENABLED !== 'true') throw new ServiceUnavailableException('Reservas serão habilitadas junto com os pagamentos após a conclusão dos testes.');
    const titularCpf = normalizeCpf(dto.titularCpf);
    if (!isValidCpf(titularCpf)) throw new ConflictException('CPF do titular inválido.');
    const expectedHash = process.env.MANDATO_TERM_HASH;
    if (!expectedHash) throw new ServiceUnavailableException('Termo de mandato ainda não configurado pelo operador.');
    if (dto.termoMandatoHash !== expectedHash) throw new ConflictException('Versão do termo de mandato inválida.');
    const expirationMinutes = Number(process.env.SHARE_RESERVATION_MINUTES ?? 15);
    const expiresAt = new Date(Date.now() + expirationMinutes * 60_000);
    const affiliate = dto.codigoAfiliado
      ? await this.prisma.afiliado.findFirst({ where: { codigoAfiliado: dto.codigoAfiliado.trim(), statusAprovacao: 'aprovado' }, select: { id: true } })
      : null;
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM boloes WHERE id = ${dto.bolaoId} FOR UPDATE`;
      const pool = await tx.bolao.findUnique({ where: { id: dto.bolaoId } });
      if (!pool) throw new NotFoundException('Bolão não encontrado.');
      if (pool.status !== StatusBolao.aberto || pool.cotasVendidas + dto.quantidade > pool.totalCotas) throw new ConflictException('Cotas insuficientes ou bolão indisponível.');
      const share = await tx.cota.create({
        data: {
          bolaoId: pool.id,
          compradorId: user.id,
          titularCpf,
          titularNome: dto.titularNome.trim(),
          quantidade: dto.quantidade,
          afiliadoReferenciaId: affiliate?.id,
          status: StatusCota.reservada,
          expiraReservaEm: expiresAt,
          mandato: { create: { usuarioId: user.id, textoHash: dto.termoMandatoHash, ipAceite: requestMeta.ip, userAgent: requestMeta.userAgent } },
        },
        include: { mandato: true },
      });
      const updatedPool = await tx.bolao.update({ where: { id: pool.id }, data: { cotasVendidas: { increment: dto.quantidade } } });
      await this.audit.record(tx, { entidade: 'bolao', entidadeId: pool.id, evento: 'cota.reservada', atorId: user.id, payloadAntes: pool as unknown as Prisma.InputJsonValue, payloadDepois: updatedPool as unknown as Prisma.InputJsonValue });
      await this.audit.record(tx, { entidade: 'cota', entidadeId: share.id, evento: 'mandato.aceito', atorId: user.id, payloadDepois: { cotaId: share.id, termoHash: share.mandato?.textoHash, afiliadoId: affiliate?.id ?? null } });
      return share;
    });
    return { id: result.id, bolaoId: result.bolaoId, status: result.status, quantidade: result.quantidade, expiraReservaEm: result.expiraReservaEm };
  }

  async listMine(user: AuthUser, onlyPrize = false) {
    const shares = await this.prisma.cota.findMany({ where: { compradorId: user.id, ...(onlyPrize ? { status: StatusCota.premiada } : {}) }, orderBy: { criadoEm: 'desc' } });
    return shares.map((share) => this.toPrivate(share, true));
  }

  async getPrivate(id: string, user: AuthUser) {
    const share = await this.prisma.cota.findUnique({ where: { id }, include: { pagamento: true, bolao: true } });
    if (!share) throw new NotFoundException('Cota não encontrada.');
    if (share.compradorId !== user.id && !['admin', 'operacao'].includes(user.papel)) throw new ForbiddenException('A cota não pertence ao usuário autenticado.');
    return this.toPrivate(share, true);
  }

  async getPrize(id: string, user: AuthUser) {
    const share = await this.prisma.cota.findUnique({ where: { id }, include: { bolao: true } });
    if (!share) throw new NotFoundException('Cota não encontrada.');
    if (share.compradorId !== user.id && !['admin', 'operacao'].includes(user.papel)) throw new ForbiddenException('Prêmio acessível somente ao titular ou compliance autorizado.');
    if (share.status !== StatusCota.premiada) throw new NotFoundException('Esta cota ainda não possui prêmio apurado.');
    return { cotaId: share.id, faixaPremio: share.faixaPremio, valorPremio: share.valorPremio?.toFixed(2) ?? null, instrucoes: 'O prêmio deve ser resgatado diretamente na Caixa ou em lotérica, com o comprovante individual vinculado ao CPF do titular.' };
  }

  async expireReservations(): Promise<number> {
    const expired = await this.prisma.cota.findMany({ where: { status: StatusCota.reservada, expiraReservaEm: { lt: new Date() } }, select: { id: true, bolaoId: true, quantidade: true } });
    let count = 0;
    for (const share of expired) {
      await this.prisma.$transaction(async (tx) => {
        const updated = await tx.cota.updateMany({ where: { id: share.id, status: StatusCota.reservada }, data: { status: StatusCota.cancelada } });
        if (updated.count === 0) return;
        await tx.bolao.update({ where: { id: share.bolaoId }, data: { cotasVendidas: { decrement: share.quantidade } } });
        await this.audit.record(tx, { entidade: 'cota', entidadeId: share.id, evento: 'cota.reservada.expirada', payloadDepois: { quantidade: share.quantidade } });
        count += 1;
      });
    }
    return count;
  }

  private toPrivate(share: { id: string; bolaoId: string; titularNome: string; titularCpf: string; status: StatusCota; quantidade: number; valorPago: Prisma.Decimal | null; comprovanteIndividualUrl: string | null; faixaPremio: string | null; valorPremio: Prisma.Decimal | null; expiraReservaEm: Date | null }, includeSensitive: boolean) {
    return {
      id: share.id,
      bolaoId: share.bolaoId,
      titularNome: share.titularNome,
      titularCpf: includeSensitive ? share.titularCpf : undefined,
      status: share.status,
      quantidade: share.quantidade,
      valorPago: share.valorPago?.toFixed(2) ?? null,
      comprovanteIndividualUrl: share.comprovanteIndividualUrl,
      ...(includeSensitive ? { faixaPremio: share.faixaPremio, valorPremio: share.valorPremio?.toFixed(2) ?? null, expiraReservaEm: share.expiraReservaEm } : {}),
    };
  }
}
