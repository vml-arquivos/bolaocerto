import { hasSaleProof } from '../attachments/proof';
import { approvedDocument } from '../legal/documents';
import { ConflictException, ForbiddenException, Injectable, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { Prisma, StatusBolao, StatusCota, StatusPagamento } from '@prisma/client';
import { AuthUser, isValidCpf, normalizeCpf } from '../auth/auth.utils';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { ResponsiblePlayService } from '../common/responsible-play.service';
import { evaluateReleaseGate } from '../pools/release-gate';
import { buildReceiptData, buildReceiptPdf, MODALITY_NAMES, receiptCode, receiptCodeMatches, ReceiptData } from './receipt';
import { ReserveShareDto } from './shares.dto';

@Injectable()
export class SharesService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, @Optional() private readonly responsible?: ResponsiblePlayService) {}

  async reserve(dto: ReserveShareDto, user: AuthUser, requestMeta: { ip: string; userAgent?: string }) {
    if (process.env.PAYMENTS_ENABLED !== 'true') throw new ServiceUnavailableException('As reservas estão temporariamente indisponíveis. Tente novamente em instantes.');
    const titularCpf = normalizeCpf(dto.titularCpf);
    if (!isValidCpf(titularCpf)) throw new ConflictException('CPF do titular inválido.');
    if (dto.aceitoTermos !== true) throw new ConflictException('O aceite expresso do contrato é obrigatório.');
    const document = approvedDocument('participacao');
    const expectedHash = document.hash;
    if (dto.termoMandatoHash !== expectedHash) throw new ConflictException('Versão do termo de mandato inválida.');
    await this.responsible?.assertCanBuy(user.id, dto.bolaoId, dto.quantidade);
    const expirationMinutes = Number(process.env.SHARE_RESERVATION_MINUTES ?? 15);
    const expiresAt = new Date(Date.now() + expirationMinutes * 60_000);
    const affiliate = dto.codigoAfiliado
      ? await this.prisma.afiliado.findFirst({ where: { codigoAfiliado: dto.codigoAfiliado.trim(), statusAprovacao: 'aprovado' }, select: { id: true } })
      : null;
    const result = await this.prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM boloes WHERE id = ${dto.bolaoId}::uuid FOR UPDATE`;
      const pool = await tx.bolao.findUnique({ where: { id: dto.bolaoId }, include: { jogos: { orderBy: { ordem: 'asc' } } } });
      if (!pool) throw new NotFoundException('Bolão não encontrado.');
      if (pool.comprovanteAntesVenda && !await hasSaleProof(tx, pool.id)) throw new ConflictException('Comprovante oficial ainda indisponível para esta venda.');
      const contestDeadline = await tx.concurso.findUniqueOrThrow({ where: { id: pool.concursoId }, select: { cutoffAt: true, status: true, resultado: { select: { id: true } } } });
      if (contestDeadline.cutoffAt <= new Date() || contestDeadline.resultado || (contestDeadline.status && contestDeadline.status !== 'aberto')) throw new ConflictException('O prazo de compra deste concurso encerrou.');
      if (pool.status !== StatusBolao.aberto || (!pool.cotasIlimitadas && (pool.totalCotas === null || pool.cotasVendidas + dto.quantidade > pool.totalCotas))) throw new ConflictException('Cotas insuficientes ou bolão indisponível.');
      if (pool.premioMinimoLiberacao !== null && pool.premioMinimoLiberacao !== undefined) {
        const contest = await tx.concurso.findUnique({ where: { id: pool.concursoId }, select: { valorEstimadoPremio: true } });
        const gate = evaluateReleaseGate({ premioMinimoLiberacao: pool.premioMinimoLiberacao, liberadoEm: pool.liberadoEm, premioAtual: contest?.valorEstimadoPremio });
        if (!gate.liberado) throw new ConflictException(gate.mensagem ?? 'As cotas deste bolão ainda não foram liberadas.');
        if (!pool.liberadoEm) {
          await tx.bolao.update({ where: { id: pool.id }, data: { liberadoEm: new Date() } });
          await this.audit.record(tx, { entidade: 'bolao', entidadeId: pool.id, evento: 'bolao.liberado_por_premio', payloadDepois: { gatilho: gate.gatilho, premioAtual: gate.premioAtual } });
        }
      }
      const share = await tx.cota.create({
        data: {
          bolaoId: pool.id,
          compradorId: user.id,
          titularCpf,
          titularNome: dto.titularNome.trim(),
          quantidade: dto.quantidade,
          afiliadoReferenciaId: affiliate?.id,
          status: StatusCota.reservada,
          expiraReservaEm: new Date(Math.min(expiresAt.getTime(), contestDeadline.cutoffAt.getTime())),
          mandato: { create: { usuarioId: user.id, textoHash: document.hash, textoSnapshot: document.texto, versao: document.versao, pedidoSnapshot: { bolaoId: pool.id, concursoId: pool.concursoId, quantidade: dto.quantidade, valorCota: pool.valorCota.toString(), taxaAdministracaoPct: pool.taxaAdministracaoPct.toString(), modeloOperacional: pool.modeloOperacional, numerosApostados: pool.numerosApostados, jogos: (pool.jogos ?? []).map(j => ({ ordem: j.ordem, numeros: j.numeros, custo: j.custo.toString() })), precificacao: pool.precificacao }, ipAceite: requestMeta.ip, userAgent: requestMeta.userAgent } },
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
    const shares = await this.prisma.cota.findMany({
      where: { compradorId: user.id, ...(onlyPrize ? { status: StatusCota.premiada } : {}) },
      orderBy: { criadoEm: 'desc' },
      include: { pagamento: { include: { notaFiscal: true } }, bolao: { include: { concurso: true, grupo: { select: { nome: true } }, jogos: { orderBy: { ordem: 'asc' } } } } },
    });
    return shares.map((share) => ({
      ...this.toPrivate(share, true),
      origemVenda: share.origemVenda,
      criadoEm: share.criadoEm,
      valorTotal: share.pagamento ? share.pagamento.valorBruto.toFixed(2) : (Number(share.bolao.valorCota) * share.quantidade).toFixed(2),
      bolao: {
        id: share.bolao.id,
        status: share.bolao.status,
        grupo: share.bolao.grupo.nome,
        valorCota: share.bolao.valorCota.toFixed(2),
        modalidade: share.bolao.concurso.modalidade,
        numeroConcurso: share.bolao.concurso.numeroConcurso,
        dataSorteio: share.bolao.concurso.dataSorteio,
        teveGanhador: share.bolao.teveGanhador,
        jogos: share.bolao.jogos.map((jogo) => ({ ordem: jogo.ordem, numeros: jogo.numeros })),
      },
      pagamento: share.pagamento ? {
        id: share.pagamento.id,
        status: share.pagamento.status,
        metodo: share.pagamento.metodo,
        qrCodePix: share.pagamento.qrCodePix,
        qrCodeUrl: share.pagamento.qrCodeUrl,
        linhaDigitavel: share.pagamento.linhaDigitavel,
        boletoUrl: share.pagamento.boletoUrl,
        vencimentoEm: share.pagamento.vencimentoEm,
        notaFiscal: share.pagamento.notaFiscal && share.pagamento.notaFiscal.status !== 'cancelada' ? { status: share.pagamento.notaFiscal.status, numero: share.pagamento.notaFiscal.numero, pdfUrl: share.pagamento.notaFiscal.pdfUrl } : null,
      } : null,
    }));
  }

  async getPrivate(id: string, user: AuthUser) {
    const share = await this.prisma.cota.findUnique({ where: { id }, include: { pagamento: true, bolao: true } });
    if (!share) throw new NotFoundException('Cota não encontrada.');
    if (share.compradorId !== user.id && !['admin', 'operacao'].includes(user.papel)) throw new ForbiddenException('A cota não pertence ao usuário autenticado.');
    return this.toPrivate(share, true);
  }

  /** Recibo completo (valores, comissão, parte da plataforma). Só existe depois da confirmação do pagamento. */
  async getReceipt(id: string, user: AuthUser): Promise<ReceiptData> {
    const share = await this.prisma.cota.findUnique({
      where: { id },
      include: { comprador: { select: { email: true } }, pagamento: { include: { notaFiscal: true } }, comissao: true, afiliadoReferencia: { select: { codigoAfiliado: true } }, mandato: true, bolao: { include: { concurso: true, grupo: { select: { nome: true } }, jogos: { orderBy: { ordem: 'asc' } } } } },
    });
    if (!share) throw new NotFoundException('Cota não encontrada.');
    if (share.compradorId !== user.id && !['admin', 'operacao'].includes(user.papel)) throw new ForbiddenException('A cota não pertence ao usuário autenticado.');
    if (!share.pagamento || share.pagamento.status !== StatusPagamento.confirmado) throw new ConflictException('O recibo fica disponível assim que o pagamento for confirmado.');
    return buildReceiptData(share as never);
  }

  async getReceiptPdf(id: string, user: AuthUser): Promise<{ filename: string; buffer: Buffer }> {
    const data = await this.getReceipt(id, user);
    const site = (process.env.WEB_ORIGIN ?? process.env.PUBLIC_API_URL ?? '').split(',')[0]!.trim().replace(/\/$/, '');
    const verifyUrl = site.startsWith('http') && !site.includes('localhost') ? `${site}/verificar-recibo?cota=${id}&codigo=${data.codigoVerificacao}` : null;
    return { filename: `recibo-${data.numero}.pdf`, buffer: await buildReceiptPdf(data, verifyUrl) };
  }

  /** Verificação pública de autenticidade: não expõe dados pessoais além do primeiro nome. */
  async verifyReceipt(id: string, code: string) {
    const share = await this.prisma.cota.findUnique({ where: { id }, include: { pagamento: true, bolao: { include: { concurso: true } } } }).catch(() => null);
    if (!share?.pagamento || share.pagamento.status !== StatusPagamento.confirmado) return { valido: false };
    const expected = receiptCode(share.id, share.pagamento.id, share.pagamento.valorBruto.toString());
    if (!receiptCodeMatches(expected, code ?? '')) return { valido: false };
    return {
      valido: true,
      numero: `BL-${share.id.slice(0, 8).toUpperCase()}`,
      titular: `${share.titularNome.trim().split(/\s+/)[0]} ***`,
      bolao: `${MODALITY_NAMES[share.bolao.concurso.modalidade] ?? share.bolao.concurso.modalidade} · concurso ${share.bolao.concurso.numeroConcurso}`,
      cotas: share.quantidade,
      valorPago: share.pagamento.valorBruto.toFixed(2),
      confirmadoEm: share.pagamento.confirmadoEm,
    };
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
        await tx.$queryRaw`SELECT id FROM boloes WHERE id = ${share.bolaoId}::uuid FOR UPDATE`;
        const updated = await tx.cota.updateMany({ where: { id: share.id, status: StatusCota.reservada, expiraReservaEm: { lt: new Date() } }, data: { status: StatusCota.cancelada } });
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
