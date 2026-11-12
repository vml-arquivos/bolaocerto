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
import { FocusIssuer, FocusNfseClient, FocusTomador, defaultIbsCbs, defaultMunicipalCode, defaultNbs, focusFetch } from './nfse.focus';

export const FISCAL_CLIENT_OVERRIDE = 'FISCAL_CLIENT_OVERRIDE';
export const FOCUS_CLIENT_OVERRIDE = 'FOCUS_CLIENT_OVERRIDE';
export type NfseProvider = 'cora' | 'focus';
export type NfseMode = 'off' | 'manual' | 'auto';

const MODE_KEY = 'nfse.modo';
const SINCE_KEY = 'nfse.auto_desde';
const IBGE_CACHE = new Map<string, string | null>();

/** Código IBGE do município pelo CEP (ViaCEP). Falha em silêncio: sem o código, o endereço do tomador simplesmente não vai na nota. */
export async function lookupIbge(cep: string): Promise<string | null> {
  if (IBGE_CACHE.has(cep)) return IBGE_CACHE.get(cep) ?? null;
  try {
    const response = await fetch(`https://viacep.com.br/ws/${cep}/json/`, { signal: AbortSignal.timeout(4000) });
    const data = await response.json() as { ibge?: string; erro?: boolean };
    const code = !data.erro && typeof data.ibge === 'string' && /^\d{7}$/.test(data.ibge) ? data.ibge : null;
    IBGE_CACHE.set(cep, code);
    return code;
  } catch { return null; }
}

/** Município do tomador: pelo CEP (ViaCEP); se a consulta falhar e o endereço for do DF (que tem um único município), é Brasília. */
/** Ano no horário de Brasília (a competência da nota). */
export function brasiliaYear(now = new Date()): number {
  return Number(new Intl.DateTimeFormat('en-US', { timeZone: 'America/Sao_Paulo', year: 'numeric' }).format(now));
}

export async function resolveIbge(cep: string, uf: string | null | undefined): Promise<string | null> {
  const found = await lookupIbge(cep);
  if (found) return found;
  return (uf ?? '').trim().toUpperCase() === 'DF' ? '5300108' : null;
}

export type CepAddress = { cep: string; logradouro: string; bairro: string; cidade: string; uf: string };

/** Endereço pelo CEP: ViaCEP (Correios) e, se falhar, BrasilAPI. Nulo quando o CEP não existe ou as duas estão fora do ar. */
export async function lookupCepAddress(cep: string): Promise<CepAddress | null> {
  const digits = (cep ?? '').replace(/\D/g, '');
  if (digits.length !== 8) return null;
  const get = async (url: string) => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 5000);
    try { const response = await fetch(url, { signal: controller.signal }); return response.ok ? await response.json() as Record<string, unknown> : null; }
    catch { return null; } finally { clearTimeout(timer); }
  };
  const text = (value: unknown) => (typeof value === 'string' ? value.trim() : '');
  const via = await get(`https://viacep.com.br/ws/${digits}/json/`);
  if (via && !via.erro && text(via.uf)) return { cep: digits, logradouro: text(via.logradouro), bairro: text(via.bairro), cidade: text(via.localidade), uf: text(via.uf).toUpperCase() };
  const brasil = await get(`https://brasilapi.com.br/api/cep/v1/${digits}`);
  if (brasil && text(brasil.state)) return { cep: digits, logradouro: text(brasil.street), bairro: text(brasil.neighborhood), cidade: text(brasil.city), uf: text(brasil.state).toUpperCase() };
  return null;
}

/** Início do aviso quando falta o endereço do participante; o painel e a nova tentativa automática reconhecem a nota por ele. */
export const ADDRESS_MISSING = 'Falta o endereço do participante para a nota.';

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

/**
 * Base da nota: só a taxa de administração (o serviço da plataforma). O custo dos jogos registrados na CAIXA é repasse, não faturamento de serviço.
 * `registro` é o que sobra do valor pago depois da taxa.
 */
export function noteBase(payment: { valorBruto: Prisma.Decimal | number; valorTaxaAdmin: Prisma.Decimal | number }) {
  const gross = round2(Number(payment.valorBruto));
  const service = round2(Number(payment.valorTaxaAdmin));
  return { bruto: gross, servico: service, registro: round2(Math.max(gross - service, 0)) };
}

@Injectable()
export class NfseService {
  private readonly logger = new Logger(NfseService.name);
  private readonly overrideClient?: CoraFiscalClient;
  private readonly overrideFocus?: FocusNfseClient;

  constructor(
    private readonly prisma: PrismaService,
    private readonly audit: AuditService,
    private readonly config: ConfigService,
    private readonly payments: PaymentsService,
    @Optional() @Inject(FISCAL_CLIENT_OVERRIDE) client?: CoraFiscalClient,
    @Optional() @Inject(FOCUS_CLIENT_OVERRIDE) focus?: FocusNfseClient,
  ) {
    this.overrideClient = client;
    this.overrideFocus = focus;
    // Nota automática: assim que o pagamento é confirmado, a rotina de emissão roda na hora.
    this.payments.onSettled?.(() => this.autoEmitSoon());
  }

  /* ------------------------------------------------------------------ */
  /* Configuração                                                        */
  /* ------------------------------------------------------------------ */

  /** Modo escolhido no painel (vale mais que NFSE_MODE) e a data a partir da qual a emissão automática vale. */
  private stored: { modo: NfseMode | null; desde: Date | null; at: number } = { modo: null, desde: null, at: 0 };

  get mode(): NfseMode {
    if (this.stored.modo) return this.stored.modo;
    const value = this.config.get<string>('NFSE_MODE', 'off');
    return value === 'manual' || value === 'auto' ? value : 'off';
  }

  /** Lê do banco o modo escolhido no painel (guarda por 10 s). Falha em silêncio: sem o banco, vale o NFSE_MODE do servidor. */
  async loadSettings(force = false): Promise<NfseMode> {
    if (force || Date.now() - this.stored.at > 10_000) {
      try {
        const rows = await this.prisma.configuracaoSistema?.findMany({ where: { chave: { in: [MODE_KEY, SINCE_KEY] } } }) ?? [];
        const mode = rows.find((row) => row.chave === MODE_KEY)?.valor;
        const since = rows.find((row) => row.chave === SINCE_KEY)?.valor;
        this.stored = { modo: mode === 'off' || mode === 'manual' || mode === 'auto' ? mode : null, desde: since && !Number.isNaN(Date.parse(since)) ? new Date(since) : null, at: Date.now() };
      } catch (error) { this.logger.warn(`Não consegui ler o modo da nota fiscal: ${(error as Error).message}`); this.stored.at = Date.now(); }
    }
    return this.mode;
  }

  /** Liga ou desliga a emissão automática pelo painel. Ao ligar, só as vendas a partir de agora entram sozinhas; as antigas ficam para o botão "Emitir as pendentes". */
  async setMode(mode: NfseMode, actor: AuthUser) {
    const before = await this.loadSettings(true);
    await this.prisma.configuracaoSistema.upsert({ where: { chave: MODE_KEY }, create: { chave: MODE_KEY, valor: mode }, update: { valor: mode } });
    if (mode === 'auto' && before !== 'auto') {
      const now = new Date().toISOString();
      await this.prisma.configuracaoSistema.upsert({ where: { chave: SINCE_KEY }, create: { chave: SINCE_KEY, valor: now }, update: { valor: now } });
    }
    await this.audit.record(this.prisma, { entidade: 'configuracao', entidadeId: actor.id, evento: 'nfse.modo_alterado', atorId: actor.id, payloadAntes: { modo: before } as unknown as Prisma.InputJsonValue, payloadDepois: { modo: mode } as unknown as Prisma.InputJsonValue });
    await this.loadSettings(true);
    return this.settings();
  }

  /** Data a partir da qual os pagamentos entram na emissão automática. */
  private autoFrom(): Date {
    if (this.stored.desde) return this.stored.desde;
    const since = this.config.get<string>('NFSE_AUTO_SINCE', '');
    return since ? new Date(`${since}T00:00:00.000-03:00`) : new Date(Date.now() - 30 * 86_400_000);
  }

  /** Quem emite a nota: `focus` (valor só do serviço, recomendado) ou `cora` (pelo valor da cobrança). */
  get provider(): NfseProvider { return this.config.get<string>('NFSE_PROVIDER', 'cora') === 'focus' ? 'focus' : 'cora'; }

  private focusEnv(): string { return this.config.get<string>('NFSE_FOCUS_ENV', 'homologacao') === 'producao' ? 'producao' : 'homologacao'; }

  private focusClient(): FocusNfseClient {
    if (this.overrideFocus) return this.overrideFocus;
    const token = this.config.get<string>('NFSE_FOCUS_TOKEN', '').trim();
    if (!token) throw new ServiceUnavailableException('Defina NFSE_FOCUS_TOKEN (token da Focus NFe) para emitir notas.');
    return new FocusNfseClient(focusFetch(token, this.focusEnv(), 20_000, this.config.get<string>('NFSE_FOCUS_BASE_URL', '').trim()));
  }

  /** Dados do prestador (a empresa) para a nota; devolve o que ainda falta configurar. */
  private focusIssuer(): { issuer: FocusIssuer | null; missing: string[] } {
    const get = (name: string, fallback = '') => (this.config.get<string>(name, fallback) ?? '').trim();
    const cnpj = (get('NFSE_CNPJ') || get('LEGAL_OPERATOR_CNPJ')).replace(/\D/g, '');
    const missing: string[] = [];
    if (!this.overrideFocus && !get('NFSE_FOCUS_TOKEN')) missing.push('NFSE_FOCUS_TOKEN');
    if (cnpj.length !== 14) missing.push('NFSE_CNPJ');
    if (!get('NFSE_MUNICIPAL_REGISTER')) missing.push('NFSE_MUNICIPAL_REGISTER');
    if (!/^\d{6}$/.test(get('NFSE_TRIB_NACIONAL'))) missing.push('NFSE_TRIB_NACIONAL');
    if (missing.length) return { issuer: null, missing };
    const optionOf = get('NFSE_SIMPLES_OPCAO', '3');
    // Grupo IBS/CBS da reforma: para optante do Simples Nacional (ME/EPP ou MEI) só é obrigatório a partir de 2027 (NT 009).
    // Sem o grupo, o fisco também não exige o endereço do tomador (regra E0234 vale para o indicador da operação).
    // NFSE_IBS_CBS_ENVIAR=true força o envio; =false nunca envia.
    const send = get('NFSE_IBS_CBS_ENVIAR');
    const simplesBefore2027 = Number(optionOf) !== 1 && brasiliaYear() < 2027;
    const ibs = send === 'false' || (send !== 'true' && simplesBefore2027) ? undefined : defaultIbsCbs(get('NFSE_TRIB_NACIONAL'));
    const withGroup = Boolean(ibs) || send === 'true';
    return {
      missing,
      issuer: {
        cnpj,
        inscricaoMunicipal: get('NFSE_MUNICIPAL_REGISTER').replace(/[^0-9A-Za-z]/g, ''), // CF/DF: só números, sem pontos, barra, traço ou espaço
        codigoMunicipio: get('NFSE_IBGE', '5300108'),
        codigoTributacaoNacional: get('NFSE_TRIB_NACIONAL'),
        codigoTributacaoMunicipal: get('NFSE_TRIB_MUNICIPAL') || defaultMunicipalCode(get('NFSE_IBGE', '5300108'), get('NFSE_TRIB_NACIONAL')),
        opcaoSimples: [1, 2, 3].includes(Number(optionOf)) ? Number(optionOf) : 3,
        percentualTributos: Number(get('NFSE_SIMPLES_PCT', '0')) || 0,
        nbs: get('NFSE_NBS') || defaultNbs(get('NFSE_TRIB_NACIONAL')),
        indicadorOperacao: withGroup ? get('NFSE_INDICADOR_OPERACAO') || ibs?.indicadorOperacao : undefined,
        ibsCbsSituacao: withGroup ? get('NFSE_IBS_CBS_CST') || ibs?.ibsCbsSituacao : undefined,
        ibsCbsClassificacao: withGroup ? get('NFSE_IBS_CBS_CLASS') || ibs?.ibsCbsClassificacao : undefined,
      },
    };
  }

  private get issPct(): number { return Number(this.config.get<string>('NFSE_ISS_PCT', '')) || 0; }

  /** A API da Cora emite a nota pelo valor da cobrança inteira. Só liga se o contador aceitar tributar também o custo dos jogos. */
  private get coraNotaValorTotal(): boolean { return this.config.get<string>('NFSE_CORA_VALOR_TOTAL', '') === 'true'; }

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

  /** Pagamentos que precisam de nota. Com a Focus, venda sem taxa de administração não tem serviço a faturar. */
  private pendingWhere(): Prisma.PagamentoWhereInput {
    return { status: StatusPagamento.confirmado, notaFiscal: null, valorBruto: { gt: new Prisma.Decimal(0) }, ...(this.provider === 'focus' ? { valorTaxaAdmin: { gt: new Prisma.Decimal(0) } } : {}) };
  }

  async settings() {
    await this.loadSettings();
    const [byStatus, withoutNote, withoutNoteSum] = await Promise.all([
      this.prisma.notaFiscal.groupBy({ by: ['status'], _count: true, _sum: { valor: true } }),
      this.prisma.pagamento.count({ where: this.pendingWhere() }),
      this.prisma.pagamento.aggregate({ where: this.pendingWhere(), _sum: { valorTaxaAdmin: true, valorBruto: true } }),
    ]);
    const issuer = this.issuerConfig();
    const focus = this.provider === 'focus';
    const focusIssuer = this.focusIssuer();
    return {
      modo: this.mode,
      modoDoPainel: this.stored.modo !== null,
      emailAoCliente: Boolean(this.config.get<string>('SMTP_HOST', '').trim()) && this.config.get<string>('SMTP_ENABLED', '').trim().toLowerCase() !== 'false',
      enderecoDoSite: (this.config.get<string>('APP_PUBLIC_URL', '') || this.config.get<string>('WEB_ORIGIN', '') || '').trim().replace(/\/+$/, '') || null,
      automaticaDesde: this.mode === 'auto' ? this.autoFrom().toISOString() : null,
      provedor: this.provider,
      ambiente: focus ? this.focusEnv() : this.config.get<string>('CORA_ENV', 'stage'),
      faltando: focus ? focusIssuer.missing : [],
      aliquotaIssPct: this.issPct || null,
      descricaoServico: this.config.get<string>('NFSE_DESCRIPTION', '') || null,
      cnae: this.config.get<string>('NFSE_CNAE', '') || null,
      codigoServico: this.config.get<string>('NFSE_SERVICE_CODE', '') || null,
      emissorConfigurado: focus ? Boolean(focusIssuer.issuer) : Boolean(issuer.municipalRegister),
      enderecoObrigatorio: focus ? Boolean(focusIssuer.issuer?.indicadorOperacao) : false,
      pronto: focus ? this.mode !== 'off' && Boolean(focusIssuer.issuer) : this.mode !== 'off' && this.issPct > 0 && Boolean(this.config.get<string>('NFSE_SERVICE_CODE', '')),
      pagamentosSemNota: withoutNote,
      baseDaNota: 'taxa_administracao',
      valorServicoSemNota: round2(Number(withoutNoteSum._sum.valorTaxaAdmin ?? 0)),
      valorRegistroSemNota: round2(Math.max(Number(withoutNoteSum._sum.valorBruto ?? 0) - Number(withoutNoteSum._sum.valorTaxaAdmin ?? 0), 0)),
      emissaoCoraValorTotal: this.coraNotaValorTotal,
      porStatus: byStatus.map((row) => ({ status: row.status, notas: row._count, valor: round2(Number(row._sum.valor ?? 0)) })),
      aviso: focus
        ? (this.focusEnv() === 'homologacao' ? 'Ambiente de teste da Focus NFe: as notas não têm valor fiscal. Quando tudo estiver certo, troque NFSE_FOCUS_ENV para producao.' : 'A nota é emitida pela Focus NFe só sobre a taxa de administração. O custo dos jogos registrados na CAIXA não entra.')
        : this.coraNotaValorTotal
        ? 'Atenção: a emissão pela Cora usa o valor da cobrança inteira (taxa de administração + custo dos jogos). Só mantenha NFSE_CORA_VALOR_TOTAL=true se o seu contador aceitar tributar também o custo dos jogos.'
        : 'A nota é sempre sobre a taxa de administração (o serviço). O custo dos jogos registrados na CAIXA não entra. Como a API da Cora emite pelo valor da cobrança inteira, a nota desses pagamentos é emitida pelo valor do serviço no app da Cora ou na prefeitura e registrada aqui com o número e o PDF.',
    };
  }

  /** Consulta na Cora se a cidade/empresa podem emitir e quais CNAEs e códigos de serviço estão disponíveis. */
  async diagnostics() {
    if (this.provider === 'focus') { const { missing } = this.focusIssuer(); return { disponivel: missing.length === 0, provedor: 'focus', ambiente: this.focusEnv(), faltando: missing, cnaes: null, codigosServico: null }; }
    const client = this.client();
    const [available, cnaes, serviceCodes] = await Promise.all([client.checkAvailability(), client.cnaes().catch(() => null), client.serviceCodes().catch(() => null)]);
    return { disponivel: available, cnaes, codigosServico: serviceCodes };
  }

  async registerIssuer(actor: AuthUser) {
    if (this.provider === 'focus') throw new BadRequestException('Com a Focus NFe, o emissor é cadastrado no painel deles (empresa, certificado A1 e inscrição municipal), não aqui.');
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
    await this.loadSettings();
    const user = await this.prisma.usuario.update({
      where: { id: userId },
      data: { enderecoCep: address.cep, enderecoLogradouro: address.logradouro, enderecoNumero: address.numero, enderecoComplemento: address.complemento || null, enderecoBairro: address.bairro, enderecoCidade: address.cidade, enderecoUf: address.uf },
      select: USER_ADDRESS_SELECT,
    });
    return this.addressView(user);
  }

  /** A nota exige o endereço do participante (Focus com o grupo da reforma tributária) e a emissão está ligada. */
  addressRequired(): boolean {
    return this.mode !== 'off' && this.provider === 'focus' && Boolean(this.focusIssuer().issuer?.indicadorOperacao);
  }

  async findCep(cep: string) {
    const found = await lookupCepAddress(cep);
    if (!found) throw new NotFoundException('CEP não encontrado. Confira os números ou preencha o endereço à mão.');
    return found;
  }

  async getAddress(userId: string) {
    await this.loadSettings();
    const user = await this.prisma.usuario.findUnique({ where: { id: userId }, select: USER_ADDRESS_SELECT });
    if (!user) throw new NotFoundException('Usuário não encontrado.');
    return this.addressView(user);
  }

  private addressView(user: AddressUser) {
    const { missing } = toReceiptAddress(user);
    return { cep: user.enderecoCep, logradouro: user.enderecoLogradouro, numero: user.enderecoNumero, complemento: user.enderecoComplemento, bairro: user.enderecoBairro, cidade: user.enderecoCidade, uf: user.enderecoUf, completo: missing.length === 0, nfseAtiva: this.mode !== 'off', obrigatorio: this.addressRequired() };
  }

  /* ------------------------------------------------------------------ */
  /* Emissão                                                             */
  /* ------------------------------------------------------------------ */

  async emitForPayment(paymentId: string, actor?: AuthUser, addressOverride?: AddressDto) {
    await this.loadSettings();
    if (this.mode === 'off') throw new BadRequestException('A emissão de NFS-e está desligada (NFSE_MODE=off).');
    if (this.provider === 'focus') return this.emitViaFocus(paymentId, actor, addressOverride);
    if (!this.issPct) throw new BadRequestException('Defina NFSE_ISS_PCT (alíquota do ISS, ex.: 5) com o seu contador.');
    const payment = await this.prisma.pagamento.findUnique({ where: { id: paymentId }, include: { notaFiscal: true, cota: { include: { comprador: { select: { id: true, ...USER_ADDRESS_SELECT } } } } } });
    if (!payment) throw new NotFoundException('Pagamento não encontrado.');
    if (payment.status !== StatusPagamento.confirmado) throw new ConflictException('Só é possível emitir nota de pagamentos confirmados.');
    if (payment.pspProvedor !== 'cora' || !payment.pspTransactionId?.startsWith('inv_')) {
      throw new ConflictException('A NFS-e da Cora é vinculada a uma cobrança da Cora. Para vendas de balcão e baixas manuais, use "Registrar nota manual".');
    }
    if (payment.notaFiscal && OPEN_STATUSES.includes(payment.notaFiscal.status)) throw new ConflictException('Este pagamento já possui nota fiscal.');
    const base = noteBase(payment);
    if (base.registro > 0.004 && !this.coraNotaValorTotal) {
      throw new ConflictException(`A Cora emite a nota pelo valor da cobrança inteira (R$ ${base.bruto.toFixed(2)}), que inclui R$ ${base.registro.toFixed(2)} de custo dos jogos. A nota deve ser só da taxa de administração (R$ ${base.servico.toFixed(2)}): emita por esse valor no app da Cora ou na prefeitura e use "Registrar nota manual".`);
    }
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


  /** Emissão pela Focus NFe: o valor da nota é só a taxa de administração; a cobrança pode ser de qualquer origem. */
  private async emitViaFocus(paymentId: string, actor?: AuthUser, addressOverride?: AddressDto) {
    const payment = await this.prisma.pagamento.findUnique({ where: { id: paymentId }, include: { notaFiscal: true, cota: { include: { comprador: { select: { id: true, nome: true, cpf: true, telefone: true, ...USER_ADDRESS_SELECT } } } } } });
    if (!payment) throw new NotFoundException('Pagamento não encontrado.');
    if (payment.status !== StatusPagamento.confirmado) throw new ConflictException('Só é possível emitir nota de pagamentos confirmados.');
    if (payment.notaFiscal && OPEN_STATUSES.includes(payment.notaFiscal.status)) throw new ConflictException('Este pagamento já possui nota fiscal.');
    const base = noteBase(payment);
    if (base.servico <= 0.004) throw new ConflictException('Este pagamento não tem taxa de administração: não há serviço a faturar.');
    const { issuer, missing } = this.focusIssuer();
    if (!issuer) throw new BadRequestException(`Falta configurar a emissão de notas: ${missing.join(', ')}.`);
    if (addressOverride) await this.saveAddress(payment.cota.comprador.id, addressOverride);
    const buyer = addressOverride ? await this.prisma.usuario.findUniqueOrThrow({ where: { id: payment.cota.comprador.id }, select: { id: true, nome: true, cpf: true, telefone: true, ...USER_ADDRESS_SELECT } }) : payment.cota.comprador;
    const { address, missing: addressMissing } = toReceiptAddress(buyer);
    const ibge = address ? await resolveIbge(address.zip_code, address.state) : null;
    const tomador: FocusTomador = {
      cpf: buyer.cpf, nome: buyer.nome, email: buyer.email, telefone: buyer.telefone,
      endereco: address && ibge ? { cep: address.zip_code, logradouro: address.street, numero: address.number, complemento: address.complement, bairro: address.district, codigoMunicipio: ibge } : null,
    };
    const description = `${this.config.get<string>('NFSE_DESCRIPTION', 'Serviço de tecnologia: uso da plataforma digital Bolão Livre')} (pagamento ${payment.id.slice(0, 8)})`;
    // Mesma referência enquanto a nota anterior deu erro (a Focus aceita reenviar); depois de cancelada, uma referência nova.
    const previous = payment.notaFiscal;
    const ref = previous?.provedorId && previous.status !== StatusNotaFiscal.cancelada ? previous.provedorId : `bl-${payment.id}${previous ? `-${Date.now().toString(36)}` : ''}`;
    const saveError = async (message: string) => {
      const erro = message.slice(0, 500);
      await this.prisma.notaFiscal.upsert({
        where: { pagamentoId: payment.id },
        create: { pagamentoId: payment.id, status: StatusNotaFiscal.erro, origem: 'focus', provedorId: ref, valor: new Prisma.Decimal(base.servico), descricao: description, erro, criadoPor: actor?.id },
        update: { status: StatusNotaFiscal.erro, origem: 'focus', provedorId: ref, valor: new Prisma.Decimal(base.servico), erro, criadoPor: actor?.id },
      });
    };
    // Com o grupo da reforma tributária (indicador da operação), o fisco recusa a nota sem o endereço do tomador (regra E0234).
    // Em vez de mandar um pedido que já se sabe recusado, avisa o que falta, avisa o participante uma vez e deixa a nota pronta para tentar de novo.
    if (issuer.indicadorOperacao && !tomador.endereco) {
      const detail = address ? 'Não encontrei o município pelo CEP informado; confira o CEP.' : `Faltam: ${addressMissing.join(', ')}.`;
      const message = `${ADDRESS_MISSING} O fisco exige o endereço nesta nota. ${detail} O participante preenche em Minha conta, ou você informa aqui em "Informar endereço e tentar de novo".`;
      const firstTime = !previous?.erro?.startsWith(ADDRESS_MISSING);
      await saveError(message);
      if (firstTime) await this.notifyAddressNeeded(payment.id, payment.cota.id, payment.cota.comprador.id);
      throw new BadRequestException(message);
    }
    let info;
    try {
      info = await this.focusClient().emit(ref, { issuer, tomador, valor: base.servico, descricao: description });
    } catch (error) {
      if (error instanceof BadRequestException) await saveError(error.message || '');
      throw error;
    }
    const data = { status: info.status as StatusNotaFiscal, origem: 'focus', provedorId: ref, valor: new Prisma.Decimal(base.servico), descricao: description, numero: info.numero, pdfUrl: info.pdf, xmlUrl: info.xml, erro: info.erro, canceladaEm: null, emitidaEm: info.status === 'emitida' ? new Date() : null, criadoPor: actor?.id };
    const note = await this.prisma.notaFiscal.upsert({ where: { pagamentoId: payment.id }, create: { pagamentoId: payment.id, ...data }, update: data });
    if (note.status === StatusNotaFiscal.emitida && previous?.status !== StatusNotaFiscal.emitida) await this.notifyIssued(payment.id);
    await this.audit.record(this.prisma, { entidade: 'nota_fiscal', entidadeId: note.id, evento: 'nfse.solicitada', atorId: actor?.id, payloadDepois: { pagamentoId: payment.id, provedor: 'focus', ref, valorServico: base.servico, status: info.status } as unknown as Prisma.InputJsonValue });
    return note;
  }

  /**
   * Aviso da Focus NFe de que uma nota mudou de situação (webhook "NFSe Nacional"). O conteúdo do aviso não é usado:
   * ele só aponta qual nota consultar, e quem diz a situação de verdade é a própria Focus, na consulta. Assim ninguém consegue forjar uma nota emitida.
   */
  async handleFocusWebhook(body: unknown): Promise<{ ok: true; atualizada: boolean }> {
    const ref = typeof (body as { ref?: unknown } | null)?.ref === 'string' ? (body as { ref: string }).ref.trim().slice(0, 120) : '';
    if (!ref) return { ok: true, atualizada: false };
    const note = await this.prisma.notaFiscal.findFirst({ where: { origem: 'focus', provedorId: ref }, select: { id: true } });
    if (!note) return { ok: true, atualizada: false };
    try { await this.refresh(note.id); return { ok: true, atualizada: true }; }
    catch (error) { this.logger.warn(`Aviso da Focus para ${ref}: consulta falhou (${(error as Error).message}); a rotina tenta de novo.`); return { ok: true, atualizada: false }; }
  }

  /** Pede ao participante o endereço para a nota fiscal (uma vez por nota). Nunca atrapalha a emissão. */
  private async notifyAddressNeeded(paymentId: string, cotaId: string, userId: string): Promise<void> {
    try {
      await this.prisma.notificacao.create({ data: { usuarioId: userId, canal: 'push', tipo: 'nota.endereco', payload: { titulo: 'Informe seu endereço para a nota fiscal', mensagem: 'Para emitir a nota fiscal do serviço da sua compra, precisamos do seu endereço. Preencha em Minha conta, em "Endereço para nota fiscal". A nota sai sozinha depois disso.', cotaId, pagamentoId: paymentId, link: '/minha-conta' } } });
    } catch (error) { this.logger.warn(`Pedido de endereço não enviado: ${(error as Error).message}`); }
  }

  /** Participante salvou o endereço: no modo automático, as notas dele que esperavam o endereço são emitidas na hora. */
  async retryAfterAddress(userId: string): Promise<void> {
    try {
      await this.loadSettings();
      if (this.mode !== 'auto') return;
      const waiting = await this.prisma.notaFiscal.findMany({
        where: { status: StatusNotaFiscal.erro, origem: 'focus', erro: { startsWith: ADDRESS_MISSING }, pagamento: { cota: { compradorId: userId } } },
        select: { pagamentoId: true }, take: 20,
      });
      for (const note of waiting) {
        try { await this.emitForPayment(note.pagamentoId); } catch (error) { this.logger.warn(`Nova tentativa da nota ${note.pagamentoId} falhou: ${(error as Error).message}`); }
      }
      await this.autoEmit();
    } catch (error) { this.logger.warn(`Nova tentativa depois do endereço falhou: ${(error as Error).message}`); }
  }

  /** Avisa o participante que a nota fiscal do serviço já pode ser baixada em "Minha conta". Nunca atrapalha a emissão. */
  private async notifyIssued(paymentId: string): Promise<void> {
    try {
      const payment = await this.prisma.pagamento.findUnique({ where: { id: paymentId }, select: { cotaId: true, notaFiscal: { select: { numero: true, pdfUrl: true } }, cota: { select: { compradorId: true } } } });
      if (!payment) return;
      // O aviso vira e-mail para o endereço cadastrado do participante, com o PDF da nota anexado (ver NotificationsService).
      await this.prisma.notificacao.create({ data: { usuarioId: payment.cota.compradorId, canal: 'push', tipo: 'nota.emitida', payload: { titulo: 'Sua nota fiscal está pronta', mensagem: 'A nota fiscal do serviço da sua compra já está disponível. Você também pode baixá-la a qualquer momento em Minha conta, dentro da cota.', cotaId: payment.cotaId, link: '/minha-conta', notaNumero: payment.notaFiscal?.numero ?? null, notaPdfUrl: payment.notaFiscal?.pdfUrl ?? null } } });
    } catch (error) { this.logger.warn(`Aviso da nota fiscal não enviado: ${(error as Error).message}`); }
  }

  /** Consulta o emissor (Cora ou Focus) e atualiza status, PDF e XML da nota. */
  async refresh(noteId: string) {
    const note = await this.prisma.notaFiscal.findUnique({ where: { id: noteId } });
    if (!note) throw new NotFoundException('Nota fiscal não encontrada.');
    if (note.origem === 'focus' && note.provedorId && note.status !== StatusNotaFiscal.cancelada) {
      const focus = await this.focusClient().get(note.provedorId);
      const updated = await this.prisma.notaFiscal.update({
        where: { id: note.id },
        data: {
          status: focus.status as StatusNotaFiscal,
          numero: focus.numero ?? note.numero,
          pdfUrl: focus.pdf ?? note.pdfUrl,
          xmlUrl: focus.xml ?? note.xmlUrl,
          emitidaEm: focus.status === 'emitida' ? (note.emitidaEm ?? new Date()) : note.emitidaEm,
          canceladaEm: focus.status === 'cancelada' ? (note.canceladaEm ?? new Date()) : note.canceladaEm,
          erro: focus.erro,
        },
      });
      if (focus.status === 'emitida' && note.status !== StatusNotaFiscal.emitida) await this.notifyIssued(note.pagamentoId);
      return updated;
    }
    if (note.origem !== 'cora' || !note.provedorId || note.status === StatusNotaFiscal.cancelada) return note;
    const info = await this.client().get(note.provedorId);
    const saved = await this.prisma.notaFiscal.update({
      where: { id: note.id },
      data: {
        status: info.status,
        pdfUrl: info.pdf ?? note.pdfUrl,
        xmlUrl: info.xml ?? note.xmlUrl,
        numero: info.number ?? note.numero,
        emitidaEm: info.status === 'emitida' ? (note.emitidaEm ?? new Date()) : note.emitidaEm,
        erro: info.status === 'erro' ? 'O fisco rejeitou a emissão. Confira a inscrição (CF/DF), regime, código de serviço e o endereço do tomador.' : null,
      },
    });
    if (info.status === 'emitida' && note.status !== StatusNotaFiscal.emitida) await this.notifyIssued(note.pagamentoId);
    return saved;
  }

  /** Atualiza notas que aguardam pagamento ou certificado. */
  async syncPending(): Promise<{ verificadas: number; atualizadas: number; erros: number }> {
    const summary = { verificadas: 0, atualizadas: 0, erros: 0 };
    await this.loadSettings();
    if (this.mode === 'off') return summary;
    const notes = await this.prisma.notaFiscal.findMany({
      where: { origem: { in: ['cora', 'focus'] }, provedorId: { not: null }, status: { in: [StatusNotaFiscal.aguardando, StatusNotaFiscal.aguardando_certificado] } },
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
  private emitting = false;

  async autoEmit(limit = 25): Promise<{ candidatos: number; emitidas: number; erros: number }> {
    const summary = { candidatos: 0, emitidas: 0, erros: 0 };
    if (this.emitting) return summary;
    this.emitting = true;
    try { return await this.autoEmitRun(limit, summary); } finally { this.emitting = false; }
  }

  /** Chamado assim que um pagamento é confirmado: no modo automático a nota sai na hora, sem esperar a rotina de 1 minuto. Nunca atrapalha o pagamento. */
  async autoEmitSoon(): Promise<void> {
    try { await this.autoEmit(); } catch (error) { this.logger.warn(`Emissão automática da nota falhou: ${(error as Error).message}`); }
  }

  /** Botão "Emitir as pendentes": emite agora as notas dos pagamentos que ainda não têm nota, inclusive os anteriores à ativação do modo automático. */
  async emitPending(actor: AuthUser, limit = 50): Promise<{ candidatos: number; emitidas: number; erros: number; primeiroErro: string | null }> {
    await this.loadSettings();
    if (this.mode === 'off') throw new BadRequestException('A emissão de notas está desligada. Escolha "Automática" ou "Manual" primeiro.');
    const rows = await this.prisma.pagamento.findMany({
      where: { status: StatusPagamento.confirmado, notaFiscal: null, valorBruto: { gt: new Prisma.Decimal(0) }, ...(this.provider === 'focus' ? { valorTaxaAdmin: { gt: new Prisma.Decimal(0) } } : { pspProvedor: 'cora' }) },
      orderBy: { confirmadoEm: 'asc' }, take: limit, select: { id: true },
    });
    const summary = { candidatos: rows.length, emitidas: 0, erros: 0, primeiroErro: null as string | null };
    for (const row of rows) {
      try { await this.emitForPayment(row.id, actor); summary.emitidas += 1; } catch (error) { summary.erros += 1; summary.primeiroErro ??= (error as Error).message; }
    }
    return summary;
  }

  private async autoEmitRun(limit: number, summary: { candidatos: number; emitidas: number; erros: number }): Promise<{ candidatos: number; emitidas: number; erros: number }> {
    const focus = this.provider === 'focus';
    await this.loadSettings();
    if (this.mode !== 'auto') return summary;
    if (focus ? !this.focusIssuer().issuer : (!this.issPct || !this.payments.coraProvider())) return summary;
    const from = this.autoFrom();
    // Com a Focus, qualquer pagamento confirmado com taxa de administração vira nota (a nota é só do serviço); o endereço do participante é opcional.
    const candidates = focus ? await this.prisma.pagamento.findMany({
      where: { status: StatusPagamento.confirmado, notaFiscal: null, valorBruto: { gt: new Prisma.Decimal(0) }, valorTaxaAdmin: { gt: new Prisma.Decimal(0) }, confirmadoEm: { gt: from } },
      orderBy: { confirmadoEm: 'asc' }, take: limit, select: { id: true },
    }) : await this.prisma.pagamento.findMany({
      where: { status: StatusPagamento.confirmado, pspProvedor: 'cora', origem: 'gateway', notaFiscal: null, confirmadoEm: { gt: from }, valorCustoBilhete: this.coraNotaValorTotal ? undefined : new Prisma.Decimal(0), cota: { comprador: { enderecoCep: { not: null }, enderecoLogradouro: { not: null }, enderecoNumero: { not: null }, enderecoBairro: { not: null }, enderecoCidade: { not: null }, enderecoUf: { not: null } } } },
      orderBy: { confirmadoEm: 'asc' }, take: limit, select: { id: true },
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
    const data = { status: StatusNotaFiscal.emitida, origem: 'manual', numero: dto.numero, pdfUrl: dto.pdfUrl ?? null, observacao: dto.observacao ?? null, valor: payment.valorTaxaAdmin, emitidaEm: new Date(), erro: null, canceladaEm: null, provedorId: null, criadoPor: actor.id };
    const note = await this.prisma.notaFiscal.upsert({ where: { pagamentoId: payment.id }, create: { pagamentoId: payment.id, ...data }, update: data });
    await this.audit.record(this.prisma, { entidade: 'nota_fiscal', entidadeId: note.id, evento: 'nfse.registrada_manual', atorId: actor.id, payloadDepois: { pagamentoId: payment.id, numero: dto.numero } as unknown as Prisma.InputJsonValue });
    return note;
  }

  async cancel(noteId: string, dto: CancelNoteDto, actor: AuthUser) {
    const note = await this.prisma.notaFiscal.findUnique({ where: { id: noteId } });
    if (!note) throw new NotFoundException('Nota fiscal não encontrada.');
    if (note.status === StatusNotaFiscal.cancelada) return note;
    if (note.origem === 'cora' && note.provedorId) await this.client().cancel(note.provedorId);
    if (note.origem === 'focus' && note.provedorId && note.status === StatusNotaFiscal.emitida) await this.focusClient().cancel(note.provedorId, dto.motivo);
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
        where: this.pendingWhere(),
        orderBy: { confirmadoEm: 'desc' },
        take: 200,
        select: { id: true, valorBruto: true, valorTaxaAdmin: true, metodo: true, confirmadoEm: true, pspProvedor: true, cota: { select: { titularNome: true, bolaoId: true, comprador: { select: { email: true, enderecoCep: true, enderecoLogradouro: true, enderecoNumero: true, enderecoBairro: true, enderecoCidade: true, enderecoUf: true } } } } },
      }),
    ]);
    return {
      notas: notes.map((note) => ({
        id: note.id, pagamentoId: note.pagamentoId, status: note.status, origem: note.origem, numero: note.numero, valor: Number(note.valor), issPct: note.issPct ? Number(note.issPct) : null,
        pdfUrl: note.pdfUrl, xmlUrl: note.xmlUrl, erro: note.erro, referencia: note.origem === 'focus' ? note.provedorId : null, observacao: note.observacao, emitidaEm: note.emitidaEm, criadoEm: note.criadoEm,
        participante: note.pagamento.cota.titularNome, email: note.pagamento.cota.comprador.email, bolao: note.pagamento.cota.bolaoId.slice(0, 8),
      })),
      semNota: pending.map((payment) => ({
        pagamentoId: payment.id, valor: Number(payment.valorBruto), taxaAdmin: Number(payment.valorTaxaAdmin), valorServico: noteBase(payment).servico, valorRegistro: noteBase(payment).registro, issEstimado: round2(noteBase(payment).servico * this.issPct / 100), metodo: payment.metodo, confirmadoEm: payment.confirmadoEm,
        participante: payment.cota.titularNome, email: payment.cota.comprador.email, bolao: payment.cota.bolaoId.slice(0, 8),
        enderecoCompleto: toReceiptAddress({ ...payment.cota.comprador, enderecoComplemento: null }).address !== null,
        emitivelPelaCora: this.provider === 'focus' ? noteBase(payment).servico > 0.004 : payment.pspProvedor === 'cora' && (this.coraNotaValorTotal || noteBase(payment).registro <= 0.004),
      })),
    };
  }
}
