import { BadRequestException, ConflictException, Inject, Injectable, Logger, NotFoundException, Optional, ServiceUnavailableException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Prisma, StatusNotaFiscal, StatusPagamento } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { AuthUser } from '../auth/auth.utils';
import { AuditService } from '../common/audit.service';
import { endOfBrazilDay, round2 } from '../common/brazil-time';
import { PrismaService } from '../common/prisma.service';
import { PaymentsService } from '../payments/payments.service';
import { AddressDto, CancelNoteDto, ManualNoteDto, NoteQueryDto } from './nfse.dto';
import { CoraFiscalClient, ReceiptAddress, ReceiptStatus } from './nfse.client';

export const FISCAL_CLIENT_OVERRIDE = 'FISCAL_CLIENT_OVERRIDE';
export type NfseMode = 'off' | 'manual' | 'auto';

const OPEN_STATUSES: StatusNotaFiscal[] = [StatusNotaFiscal.aguardando, StatusNotaFiscal.aguardando_certificado, StatusNotaFiscal.emitida];
const USER_ADDRESS_SELECT = { enderecoCep: true, enderecoLogradouro: true, enderecoNumero: true, enderecoComplemento: true, enderecoBairro: true, enderecoCidade: true, enderecoUf: true, email: true } as const;
type AddressUser = Prisma.UsuarioGetPayload<{ select: typeof USER_ADDRESS_SELECT }>;

/** Converte o endereço salvo no usuário no formato da Cora; devolve os campos que faltam. */
export function toReceiptAddress(user: AddressUser): { address: ReceiptAddress | null; missing: string[] } {
  const missing: string[] = [];
  const need = (value: string | null, label: string) => { if (!value || !value.trim()) missing.push(label); return (value ?? '').trim(); };
  const street = need(user.enderecoLogradouro, 'logradouro');
  const number = need(user.enderecoNumero, 'número');
  const district = need(user.enderecoBairro, 'bairro');
  const city = need(user.enderecoCidade, 'cidade');
  const state = need(user.enderecoUf, 'UF');
  const zip = need(user.enderecoCep, 'CEP');
  if (missing.length) return { address: null, missing };
  return { address: { street, number, district, city, state, zip_code: zip, complement: user.enderecoComplemento?.trim() || undefined }, missing };
}

@Injectable()
export class NfseService {
  private readonly logger = new Logger(NfseService.name);
  private readonly overrideClient?: CoraFiscalClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly payments: PaymentsService,
    @Optional() @Inject(FISCAL_CLIENT_OVERRIDE) client?: CoraFiscalClient,
  ) {
    this.overrideClient = client;
  }

  /* ------------------------------------------------------------------ */
  /* Configuração                                                        */
  /* ------------------------------------------------------------------ */

  get mode(): NfseMode {
    const value = this.config.get<string>('NFSE_MODE', 'off');
    return value === 'manual' || value === 'auto' ? value : 'off';
  }

  private get issPct(): number { return Number(this.config.get<string>('NFSE_ISS_PCT', '')) || 0; }

  private client(): CoraFiscalClient {
    if (this.overrideClient) return this.overrideClient;
    const cora = this.payments.coraProvider();
    if (!cora) throw new ServiceUnavailableException('A NFS-e da Cora exige PAYMENT_PROVIDER=cora com as credenciais configuradas.');
    return new CoraFiscalClient((method, path, body, key) => cora.request(method, path, body, key));
  }

  private issuerConfig() {
    const get = (name: string, fallback = '') => this.config.get<string>(name, fallback).trim();
    return {
      municipalRegister: get('NFSE_MUNICIPAL_REGISTER'),
      stateRegister: get('NFSE_STATE_REGISTER'),
      taxRegime: get('NFSE_TAX_REGIME', 'SIMPLES_NACIONAL'),
      specialTaxRegime: get('NFSE_SPECIAL_TAX_REGIME', 'NONE'),
      rpsSerial: get('NFSE_RPS_SERIAL', '1'),
      rpsLastNumber: get('NFSE_RPS_LAST_NUMBER', '1'),
    };
  }

  async settings() {
    const [byStatus, withoutNote] = await Promise.all([
      this.prisma.notaFiscal.groupBy({ by: ['status'], _count: true, _sum: { valor: true } }),
      this.prisma.pagamento.count({ where: { status: StatusPagamento.confirmado, notaFiscal: null } }),
    ]);
    const issuer = this.issuerConfig();
    return {
      modo: this.mode,
      provedor: 'cora',
      ambiente: this.config.get<string>('CORA_ENV', 'stage'),
      aliquotaIssPct: this.issPct || null,
      descricaoServico: this.config.get<string>('NFSE_DESCRIPTION', '') || null,
      cnae: this.config.get<string>('NFSE_CNAE', '') || null,
      codigoServico: this.config.get<string>('NFSE_SERVICE_CODE', '') || null,
      emissorConfigurado: Boolean(issuer.municipalRegister),
      pronto: this.mode !== 'off' && this.issPct > 0 && Boolean(this.config.get<string>('NFSE_SERVICE_CODE', '')),
      pagamentosSemNota: withoutNote,
      porStatus: byStatus.map((row) => ({ status: row.status, notas: row._count, valor: round2(Number(row._sum.valor ?? 0)) })),
      aviso: 'A API da Cora vincula a nota à cobrança e a emite pelo valor dela (não há campo de valor próprio). Confirme com seu contador se isso atende ao seu enquadramento, pois a receita do serviço é a taxa de administração.',
    };
  }

  /** Consulta na Cora se a cidade/empresa podem emitir e quais CNAEs e códigos de serviço estão disponíveis. */
  async diagnostics() {
    const client = this.client();
    const [available, cnaes, serviceCodes] = await Promise.all([client.checkAvailability(), client.cnaes().catch(() => null), client.serviceCodes().catch(() => null)]);
    return { disponivel: available, cnaes, codigosServico: serviceCodes };
  }

  async registerIssuer(actor: AuthUser) {
    const issuer = this.issuerConfig();
    if (!issuer.municipalRegister) throw new BadRequestException('Defina NFSE_MUNICIPAL_REGISTER (inscrição municipal) antes de cadastrar o emissor.');
    await this.client().registerIssuer(issuer);
    await this.audit.record(this.prisma, { entidade: 'configuracao', entidadeId: actor.id, evento: 'nfse.emissor_cadastrado', atorId: actor.id, payloadDepois: { regime: issuer.taxRegime, regimeEspecial: issuer.specialTaxRegime, serie: issuer.rpsSerial } as unknown as Prisma.InputJsonValue });
    return { ok: true, observacao: 'Emissor cadastrado. Envie o certificado digital A1 pelo painel da Cora Web para concluir.' };
  }

  /* ------------------------------------------------------------------ */
  /* Endereço do tomador                                                 */
  /* ------------------------------------------------------------------ */

  async saveAddress(userId: string, address: AddressDto) {
    const user = await this.prisma.usuario.update({
      where: { id: userId },
      data: { enderecoCep: address.cep, enderecoLogradouro: address.logradouro, enderecoNumero: address.numero, enderecoComplemento: address.complemento || null, enderecoBairro: address.bairro, enderecoCidade: address.cidade, enderecoUf: address.uf },
      select: USER_ADDRESS_SELECT,
    });
    return this.addressView(user);
  }

  async getAddress(userId: string) {
    const user = await this.prisma.usuario.findUnique({ where: { id: userId }, select: USER_ADDRESS_SELECT });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return this.addressView(user);
  }

  private addressView(user: AddressUser) {
    const { missing } = toReceiptAddress(user);
    return { cep: user.enderecoCep, logradouro: user.enderecoLogradouro, numero: user.enderecoNumero, complemento: user.enderecoComplemento, bairro: user.enderecoBairro, cidade: user.enderecoCidade, uf: user.enderecoUf, completo: missing.length === 0, nfseAtiva: this.mode !== 'off' };
  }

  /* ------------------------------------------------------------------ */
  /* Emissão                                                             */
  /* ------------------------------------------------------------------ */

  async emitForPayment(paymentId: string, actor?: AuthUser, addressOverride?: AddressDto) {
    if (this.mode === 'off') throw new BadRequestException('A emissão de NFS-e está desligada (NFSE_MODE=off).');
    if (!this.issPct) throw new BadRequestException('Defina NFSE_ISS_PCT (alíquota do ISS, ex.: 5) com o seu contador.');
    const payment = await this.prisma.pagamento.findUnique({ where: { id: paymentId }, include: { notaFiscal: true, cota: { include: { comprador: { select: { id: true, ...USER_ADDRESS_SELECT } } } } } });
    if (!payment) throw new NotFoundException('Pagamento não encontrado.');
    if (payment.status !== StatusPagamento.confirmado) throw new ConflictException('Só é possível emitir nota de pagamentos confirmados.');
    if (payment.pspProvedor !== 'cora' || !payment.pspTransactionId?.startsWith('inv_')) {
      throw new ConflictException('A NFS-e da Cora é vinculada a uma cobrança da Cora. Para vendas de balcão e baixas manuais, use "Registrar nota manual".');
    }
    if (payment.notaFiscal && OPEN_STATUSES.includes(payment.notaFiscal.status)) throw new ConflictException('Este pagamento já possui nota fiscal.');
    if (addressOverride) await this.saveAddress(payment.cota.comprador.id, addressOverride);
    const buyer = addressOverride ? await this.prisma.usuario.findUniqueOrThrow({ where: { id: payment.cota.comprador.id }, select: USER_ADDRESS_SELECT }) : payment.cota.comprador;
    const { address, missing } = toReceiptAddress(buyer);
    if (!address) throw new BadRequestException(`Endereço do participante incompleto (falta: ${missing.join(', ')}). Peça ao participante em "Minha conta" ou informe aqui.`);

    const cnae = this.config.get<string>('NFSE_CNAE', '');
    const serviceCode = this.config.get<string>('NFSE_SERVICE_CODE', '');
    const municipalTaxCode = this.config.get<string>('NFSE_MUNICIPAL_TAX_CODE', '');
    const withheld = this.config.get<string>('NFSE_ISS_WITHHELD', '');
    const description = this.config.get<string>('NFSE_DESCRIPTION', 'Serviço de intermediação e administração de participação em bolão');
    const retry = Boolean(payment.notaFiscal);
    let created: { id: string; status: ReceiptStatus };
    try {
      created = await this.client().emit({
        chargeId: payment.pspTransactionId, email: buyer.email, address, issPct: this.issPct,
        issWithheld: withheld === 'true' ? true : withheld === 'false' ? false : undefined,
        description, cnae: cnae || undefined, serviceCode: serviceCode || undefined, municipalTaxCode: municipalTaxCode || undefined,
      }, retry ? randomUUID() : `nfse-${payment.id}`);
    } catch (error) {
      // Recusa da Cora (dados a corrigir): registra para o painel; falhas de rede/indisponibilidade não geram registro.
      if (error instanceof BadRequestException) {
        await this.prisma.notaFiscal.upsert({
          where: { pagamentoId: payment.id },
          create: { pagamentoId: payment.id, status: StatusNotaFiscal.erro, origem: 'cora', valor: payment.valorBruto, issPct: new Prisma.Decimal(this.issPct), descricao: description, erro: (error.message || '').slice(0, 500), criadoPor: actor?.id },
          update: { status: StatusNotaFiscal.erro, erro: (error.message || '').slice(0, 500), criadoPor: actor?.id },
        });
      }
      throw error;
    }
    const note = await this.prisma.notaFiscal.upsert({
      where: { pagamentoId: payment.id },
      create: { pagamentoId: payment.id, status: created.status, origem: 'cora', provedorId: created.id, valor: payment.valorBruto, issPct: new Prisma.Decimal(this.issPct), descricao: description, criadoPor: actor?.id },
      update: { status: created.status, origem: 'cora', provedorId: created.id, valor: payment.valorBruto, issPct: new Prisma.Decimal(this.issPct), descricao: description, erro: null, canceladaEm: null, criadoPor: actor?.id },
    });
    await this.audit.record(this.prisma, { entidade: 'nota_fiscal', entidadeId: note.id, evento: 'nfse.solicitada', atorId: actor?.id, payloadDepois: { pagamentoId: payment.id, provedorId: created.id, status: created.status } as unknown as Prisma.InputJsonValue });
    try { return await this.refresh(note.id); } catch (error) { this.logger.warn(`NFS-e ${note.id} criada, mas a consulta inicial falhou: ${(error as Error).message}`); return note; }
  }

  /** Consulta a Cora e atualiza status, PDF e XML da nota. */
  async refresh(noteId: string) {
    const note = await this.prisma.notaFiscal.findUnique({ where: { id: noteId } });
    if (!note) throw new NotFoundException('Nota fiscal não encontrada.');
    if (note.origem !== 'cora' || !note.provedorId || note.status === StatusNotaFiscal.cancelada) return note;
    const info = await this.client().get(note.provedorId);
    return this.prisma.notaFiscal.update({
      where: { id: note.id },
      data: {
        status: info.status,
        pdfUrl: info.pdf ?? note.pdfUrl,
        xmlUrl: info.xml ?? note.xmlUrl,
        numero: info.number ?? note.numero,
        emitidaEm: info.status === 'emitida' ? (note.emitidaEm ?? new Date()) : note.emitidaEm,
        erro: info.status === 'erro' ? 'A prefeitura rejeitou a emissão. Confira inscrição municipal, regime, código de serviço e o endereço do tomador.' : null,
      },
    });
  }

  /** Atualiza notas que aguardam pagamento ou certificado. */
  async syncPending(): Promise<{ verificadas: number; atualizadas: number; erros: number }> {
    const summary = { verificadas: 0, atualizadas: 0, erros: 0 };
    if (this.mode === 'off') return summary;
    const notes = await this.prisma.notaFiscal.findMany({
      where: { origem: 'cora', provedorId: { not: null }, status: { in: [StatusNotaFiscal.aguardando, StatusNotaFiscal.aguardando_certificado] } },
      orderBy: { criadoEm: 'asc' },
      take: 100,
    });
    for (const note of notes) {
      summary.verificadas += 1;
      try {
        const updated = await this.refresh(note.id);
        if (updated.status !== note.status) summary.atualizadas += 1;
      } catch (error) {
        summary.erros += 1;
        this.logger.warn(`Sincronização da NFS-e ${note.id} falhou: ${(error as Error).message}`);
      }
    }
    return summary;
  }

  /** Modo automático: emite as notas dos pagamentos confirmados cujo participante já informou o endereço. */
  async autoEmit(limit = 25): Promise<{ candidatos: number; emitidas: number; erros: number }> {
    const summary = { candidatos: 0, emitidas: 0, erros: 0 };
    if (this.mode !== 'auto' || !this.issPct || !this.payments.coraProvider()) return summary;
    const since = this.config.get<string>('NFSE_AUTO_SINCE', '');
    const from = since ? new Date(`${since}T00:00:00.000-03:00`) : new Date(Date.now() - 30 * 86_400_000);
    const candidates = await this.prisma.pagamento.findMany({
      where: {
        status: StatusPagamento.confirmado, pspProvedor: 'cora', origem: 'gateway', notaFiscal: null, confirmadoEm: { gt: from },
        cota: { comprador: { enderecoCep: { not: null }, enderecoLogradouro: { not: null }, enderecoNumero: { not: null }, enderecoBairro: { not: null }, enderecoCidade: { not: null }, enderecoUf: { not: null } } },
      },
      orderBy: { confirmadoEm: 'asc' },
      take: limit,
      select: { id: true },
    });
    for (const candidate of candidates) {
      summary.candidatos += 1;
      try { await this.emitForPayment(candidate.id); summary.emitidas += 1; } catch (error) {
        summary.erros += 1;
        this.logger.warn(`Emissão automática falhou para o pagamento ${candidate.id}: ${(error as Error).message}`);
      }
    }
    return summary;
  }

  /* ------------------------------------------------------------------ */
  /* Operação manual                                                     */
  /* ------------------------------------------------------------------ */

  /** Registra uma nota emitida fora do sistema (app da Cora, prefeitura ou contador). */
  async registerManual(paymentId: string, dto: ManualNoteDto, actor: AuthUser) {
    const payment = await this.prisma.pagamento.findUnique({ where: { id: paymentId }, include: { notaFiscal: true } });
    if (!payment) throw new NotFoundException('Pagamento não encontrado.');
    if (payment.status !== StatusPagamento.confirmado) throw new ConflictException('Só é possível registrar nota de pagamentos confirmados.');
    if (payment.notaFiscal && OPEN_STATUSES.includes(payment.notaFiscal.status)) throw new ConflictException('Este pagamento já possui nota fiscal.');
    const data = { status: StatusNotaFiscal.emitida, origem: 'manual', numero: dto.numero, pdfUrl: dto.pdfUrl ?? null, observacao: dto.observacao ?? null, valor: payment.valorBruto, emitidaEm: new Date(), erro: null, canceladaEm: null, provedorId: null, criadoPor: actor.id };
    const note = await this.prisma.notaFiscal.upsert({ where: { pagamentoId: payment.id }, create: { pagamentoId: payment.id, ...data }, update: data });
    await this.audit.record(this.prisma, { entidade: 'nota_fiscal', entidadeId: note.id, evento: 'nfse.registrada_manual', atorId: actor.id, payloadDepois: { pagamentoId: payment.id, numero: dto.numero } as unknown as Prisma.InputJsonValue });
    return note;
  }

  async cancel(noteId: string, dto: CancelNoteDto, actor: AuthUser) {
    const note = await this.prisma.notaFiscal.findUnique({ where: { id: noteId } });
    if (!note) throw new NotFoundException('Nota fiscal não encontrada.');
    if (note.status === StatusNotaFiscal.cancelada) return note;
    if (note.origem === 'cora' && note.provedorId) await this.client().cancel(note.provedorId);
    const updated = await this.prisma.notaFiscal.update({ where: { id: note.id }, data: { status: StatusNotaFiscal.cancelada, canceladaEm: new Date(), observacao: dto.motivo } });
    await this.audit.record(this.prisma, { entidade: 'nota_fiscal', entidadeId: note.id, evento: 'nfse.cancelada', atorId: actor.id, payloadAntes: { status: note.status } as unknown as Prisma.InputJsonValue, payloadDepois: { motivo: dto.motivo } as unknown as Prisma.InputJsonValue });
    return updated;
  }

  /* ------------------------------------------------------------------ */
  /* Consulta                                                            */
  /* ------------------------------------------------------------------ */

  async list(query: NoteQueryDto) {
    const range: { gte?: Date; lte?: Date } = {};
    if (query.de) range.gte = new Date(`${query.de}T00:00:00.000-03:00`);
    if (query.ate) range.lte = endOfBrazilDay(query.ate);
    const [notes, pending] = await Promise.all([
      this.prisma.notaFiscal.findMany({
        where: { ...(query.status ? { status: query.status as StatusNotaFiscal } : {}), ...(range.gte || range.lte ? { criadoEm: range } : {}) },
        include: { pagamento: { include: { cota: { select: { id: true, titularNome: true, bolaoId: true, comprador: { select: { email: true } } } } } } },
        orderBy: { criadoEm: 'desc' },
        take: 300,
      }),
      this.prisma.pagamento.findMany({
        where: { status: StatusPagamento.confirmado, notaFiscal: null },
        orderBy: { confirmadoEm: 'desc' },
        take: 200,
        select: { id: true, valorBruto: true, valorTaxaAdmin: true, metodo: true, confirmadoEm: true, pspProvedor: true, cota: { select: { titularNome: true, bolaoId: true, comprador: { select: { email: true, enderecoCep: true, enderecoLogradouro: true, enderecoNumero: true, enderecoBairro: true, enderecoCidade: true, enderecoUf: true } } } } },
      }),
    ]);
    return {
      notas: notes.map((note) => ({
        id: note.id, pagamentoId: note.pagamentoId, status: note.status, origem: note.origem, numero: note.numero, valor: Number(note.valor), issPct: note.issPct ? Number(note.issPct) : null,
        pdfUrl: note.pdfUrl, xmlUrl: note.xmlUrl, erro: note.erro, observacao: note.observacao, emitidaEm: note.emitidaEm, criadoEm: note.criadoEm,
        participante: note.pagamento.cota.titularNome, email: note.pagamento.cota.comprador.email, bolao: note.pagamento.cota.bolaoId.slice(0, 8),
      })),
      semNota: pending.map((payment) => ({
        pagamentoId: payment.id, valor: Number(payment.valorBruto), taxaAdmin: Number(payment.valorTaxaAdmin), metodo: payment.metodo, confirmadoEm: payment.confirmadoEm,
        participante: payment.cota.titularNome, email: payment.cota.comprador.email, bolao: payment.cota.bolaoId.slice(0, 8),
        enderecoCompleto: toReceiptAddress({ ...payment.cota.comprador, enderecoComplemento: null }).address !== null,
        emitivelPelaCora: payment.pspProvedor === 'cora',
      })),
    };
  }
}
