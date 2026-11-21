import { BadRequestException, ConflictException, ForbiddenException, HttpException, HttpStatus, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Cron } from '@nestjs/schedule';
import { Prisma } from '@prisma/client';
import { createHmac, randomInt, timingSafeEqual } from 'node:crypto';
import { AuditService } from '../common/audit.service';
import { escapeHtml, MailService, wrapEmailHtml } from '../common/mail.service';
import { PrismaService } from '../common/prisma.service';
import { AuthUser } from '../auth/auth.utils';
import { buildContractPdf, type CertificateBlock } from './contract-pdf';
import {
  buildContractText, companyHash, CONTRACT_TEMPLATE_VERSION, CONTRACT_TITLES, formatCpf, longDate, sanitizeCompany, textHash,
  type AffiliateParty, type CompanyData, type ContractKind,
} from './contract-templates';

export const COMPANY_KEY = 'contratos.empresa';
const COMPANY_CODE_KEY = 'contratos.empresa.codigo';
const CODE_TTL_MS = 15 * 60 * 1000;
const RESEND_MS = 60 * 1000;
const MAX_ATTEMPTS = 5;
const MAX_SENDS_PER_DAY = 10;
const STATUS = ['aguardando', 'assinado', 'cancelado'] as const;

export type SignatureMeta = { ip: string; userAgent: string | null; forwardedFor: string | null };
export type DeviceInfo = { latitude?: number | null; longitude?: number | null; precisao?: number | null; localNegado?: boolean; fuso?: string | null; idioma?: string | null };
export type CompanyApproval = { hash: string; usuarioId: string; nome: string; email: string; em: string; ip: string; userAgent: string | null; local: Record<string, unknown> | null };
type ContractEvent = { em: string; evento: string; detalhe?: string; ip?: string; por?: string };

/** Esconde parte do e-mail: m*****o@gmail.com. */
export function maskEmail(email: string): string {
  const [user = '', domain = ''] = email.split('@');
  if (!domain) return email;
  if (user.length <= 2) return `${user[0] ?? ''}*@${domain}`;
  return `${user[0]}${'*'.repeat(Math.min(6, user.length - 2))}${user[user.length - 1]}@${domain}`;
}

/** Endereço em uma linha a partir do cadastro (ou null quando faltam dados essenciais). */
export function addressLine(user: { enderecoLogradouro?: string | null; enderecoNumero?: string | null; enderecoComplemento?: string | null; enderecoBairro?: string | null; enderecoCidade?: string | null; enderecoUf?: string | null; enderecoCep?: string | null }): string | null {
  if (!user.enderecoLogradouro || !user.enderecoCidade) return null;
  const cep = (user.enderecoCep ?? '').replace(/\D/g, '');
  return [
    `${user.enderecoLogradouro}${user.enderecoNumero ? `, nº ${user.enderecoNumero}` : ''}${user.enderecoComplemento ? `, ${user.enderecoComplemento}` : ''}`,
    user.enderecoBairro,
    `${user.enderecoCidade}${user.enderecoUf ? `/${user.enderecoUf.toUpperCase()}` : ''}`,
    cep.length === 8 ? `CEP ${cep.slice(0, 2)}.${cep.slice(2, 5)}-${cep.slice(5)}` : null,
  ].filter(Boolean).join(', ');
}

/** Localização informada pelo aparelho, só com números válidos. */
export function cleanDevice(device: DeviceInfo | null | undefined): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  const lat = Number(device?.latitude);
  const lng = Number(device?.longitude);
  if (device?.latitude !== null && device?.latitude !== undefined && Number.isFinite(lat) && Math.abs(lat) <= 90 && Number.isFinite(lng) && Math.abs(lng) <= 180) {
    out.latitude = Math.round(lat * 1e6) / 1e6;
    out.longitude = Math.round(lng * 1e6) / 1e6;
    const accuracy = Number(device?.precisao);
    if (Number.isFinite(accuracy) && accuracy >= 0) out.precisaoMetros = Math.round(accuracy);
  } else {
    out.localizacao = device?.localNegado ? 'não autorizada no aparelho' : 'não informada pelo aparelho';
  }
  if (device?.fuso) out.fuso = String(device.fuso).slice(0, 60);
  if (device?.idioma) out.idioma = String(device.idioma).slice(0, 30);
  return out;
}

function dateTimeBr(value: Date | string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return `${date.toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit' })} (horário de Brasília)`;
}

function localText(local: Record<string, unknown> | null | undefined): string {
  if (!local) return '—';
  if (typeof local.latitude === 'number' && typeof local.longitude === 'number') return `${local.latitude}, ${local.longitude}${typeof local.precisaoMetros === 'number' ? ` (precisão de ${local.precisaoMetros} m)` : ''}`;
  return String(local.localizacao ?? '—');
}

@Injectable()
export class ContractsService {
  private readonly logger = new Logger(ContractsService.name);
  private running = false;

  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService, private readonly mail: MailService) {}

  private secret(): string {
    return process.env.CONTRACT_CODE_SECRET || process.env.JWT_ACCESS_SECRET || 'bl-contratos';
  }

  codeHash(scope: string, code: string): string {
    return createHmac('sha256', this.secret()).update(`${scope}:${code}`).digest('hex');
  }

  private sameHash(a: string | null | undefined, b: string): boolean {
    if (!a || a.length !== b.length) return false;
    return timingSafeEqual(Buffer.from(a), Buffer.from(b));
  }

  private newCode(): string {
    return String(randomInt(0, 1_000_000)).padStart(6, '0');
  }

  private verifyUrl(numero: string, hash: string): string {
    return `${this.mail.publicUrl()}/verificar-contrato?numero=${encodeURIComponent(numero)}&codigo=${hash}`;
  }

  // ---------- Empresa (contratante e representante legal) ----------

  private async readJson<T>(key: string): Promise<T | null> {
    const row = await this.prisma.configuracaoSistema.findUnique({ where: { chave: key } });
    if (!row) return null;
    try { return JSON.parse(row.valor) as T; } catch { return null; }
  }

  private async writeJson(key: string, value: unknown): Promise<void> {
    const valor = JSON.stringify(value);
    await this.prisma.configuracaoSistema.upsert({ where: { chave: key }, create: { chave: key, valor }, update: { valor } });
  }

  async company() {
    const stored = await this.readJson<{ dados?: Partial<CompanyData>; aprovacao?: CompanyApproval | null }>(COMPANY_KEY);
    const dados = sanitizeCompany(stored?.dados);
    const hash = companyHash(dados);
    const aprovacao = stored?.aprovacao && stored.aprovacao.hash === hash ? stored.aprovacao : null;
    return { dados, hash, versaoModelo: CONTRACT_TEMPLATE_VERSION, aprovacao, aprovacaoAnterior: !aprovacao && stored?.aprovacao ? stored.aprovacao : null };
  }

  async saveCompany(actor: AuthUser, raw: Partial<CompanyData>) {
    const before = await this.company();
    const dados = sanitizeCompany(raw);
    const stored = await this.readJson<{ aprovacao?: CompanyApproval | null }>(COMPANY_KEY);
    await this.writeJson(COMPANY_KEY, { dados, aprovacao: stored?.aprovacao ?? null });
    await this.audit.record(this.prisma, { entidade: 'contrato', entidadeId: actor.id, evento: 'contrato.empresa_atualizada', atorId: actor.id, payloadAntes: before.dados as unknown as Prisma.InputJsonValue, payloadDepois: dados as unknown as Prisma.InputJsonValue });
    return this.company();
  }

  async sendCompanyCode(actor: AuthUser) {
    const company = await this.company();
    const user = await this.prisma.usuario.findUniqueOrThrow({ where: { id: actor.id }, select: { id: true, nome: true, email: true } });
    const previous = await this.readJson<{ enviadoEm?: string }>(COMPANY_CODE_KEY);
    if (previous?.enviadoEm && Date.now() - new Date(previous.enviadoEm).getTime() < RESEND_MS) throw new HttpException('Aguarde 1 minuto para pedir outro código.', HttpStatus.TOO_MANY_REQUESTS);
    const code = this.newCode();
    const scope = `empresa:${company.hash}:${user.id}`;
    const sent = await this.mail.send({
      to: user.email,
      subject: 'Código para assinar o modelo de contrato do afiliado',
      text: `Seu código para assinar, em nome da ${company.dados.razaoSocial}, o modelo de contrato do afiliado é ${code}. Ele vale por 15 minutos. Se não foi você, ignore este e-mail.`,
      html: wrapEmailHtml('Código de assinatura', `<p>Use o código abaixo para assinar, em nome da <strong>${escapeHtml(company.dados.razaoSocial)}</strong>, o modelo de contrato do afiliado.</p><p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:18px 0">${code}</p><p>O código vale por 15 minutos. Se não foi você, ignore este e-mail.</p>`),
    });
    if (!sent) throw new ConflictException('Não foi possível enviar o e-mail agora. Confira o e-mail do sistema em Integrações e tente de novo.');
    await this.writeJson(COMPANY_CODE_KEY, { hash: this.codeHash(scope, code), usuarioId: user.id, empresaHash: company.hash, expiraEm: new Date(Date.now() + CODE_TTL_MS).toISOString(), tentativas: 0, enviadoEm: new Date().toISOString() });
    return { enviado: true, email: maskEmail(user.email) };
  }

  async approveCompany(actor: AuthUser, code: string, device: DeviceInfo | undefined, meta: SignatureMeta) {
    const company = await this.company();
    const pending = await this.readJson<{ hash: string; usuarioId: string; empresaHash: string; expiraEm: string; tentativas: number }>(COMPANY_CODE_KEY);
    if (!pending || pending.usuarioId !== actor.id || pending.empresaHash !== company.hash) throw new BadRequestException('Peça um novo código para assinar.');
    if (new Date(pending.expiraEm).getTime() < Date.now()) throw new BadRequestException('O código venceu. Peça um novo.');
    if (pending.tentativas >= MAX_ATTEMPTS) throw new BadRequestException('Muitas tentativas. Peça um novo código.');
    if (!this.sameHash(pending.hash, this.codeHash(`empresa:${company.hash}:${actor.id}`, code.trim()))) {
      await this.writeJson(COMPANY_CODE_KEY, { ...pending, tentativas: pending.tentativas + 1 });
      throw new BadRequestException('Código incorreto.');
    }
    const user = await this.prisma.usuario.findUniqueOrThrow({ where: { id: actor.id }, select: { id: true, nome: true, email: true } });
    const approval: CompanyApproval = { hash: company.hash, usuarioId: user.id, nome: user.nome, email: user.email, em: new Date().toISOString(), ip: meta.ip, userAgent: meta.userAgent, local: cleanDevice(device) };
    await this.writeJson(COMPANY_KEY, { dados: company.dados, aprovacao: approval });
    await this.prisma.configuracaoSistema.deleteMany({ where: { chave: COMPANY_CODE_KEY } });
    const event: ContractEvent = { em: approval.em, evento: 'empresa_assinou', detalhe: `${user.nome} (${maskEmail(user.email)})`, ip: meta.ip };
    const pendingContracts = await this.prisma.contrato.findMany({ where: { empresaHash: company.hash, empresaAssinadaEm: null, status: { not: 'cancelado' } }, select: { id: true, eventos: true } });
    for (const item of pendingContracts) {
      await this.prisma.contrato.update({ where: { id: item.id }, data: { empresaAssinadaEm: new Date(approval.em), empresaAssinatura: approval as unknown as Prisma.InputJsonValue, eventos: [...((item.eventos as ContractEvent[] | null) ?? []), event] as unknown as Prisma.InputJsonValue } });
    }
    await this.audit.record(this.prisma, { entidade: 'contrato', entidadeId: actor.id, evento: 'contrato.empresa_assinou_modelo', atorId: actor.id, payloadDepois: { hash: company.hash, contratosAtualizados: pendingContracts.length, ip: meta.ip } });
    return { ...(await this.company()), contratosAtualizados: pendingContracts.length };
  }

  // ---------- Geração ----------

  private async affiliateParty(afiliadoId: string) {
    const affiliate = await this.prisma.afiliado.findUnique({ where: { id: afiliadoId }, include: { usuario: true } });
    if (!affiliate) throw new NotFoundException('Afiliado não encontrado.');
    const u = affiliate.usuario;
    const party: AffiliateParty = { nome: u.nome, cpf: u.cpf, email: u.email, telefone: u.telefone, dataNascimento: u.dataNascimento, endereco: addressLine(u), codigoAfiliado: affiliate.codigoAfiliado, comissaoPct: affiliate.comissaoPadraoPct ? Number(affiliate.comissaoPadraoPct).toFixed(2) : null };
    return { affiliate, party };
  }

  private makeNumber(kind: ContractKind, date: Date): string {
    const local = new Date(date.getTime() - 3 * 60 * 60 * 1000);
    const stamp = `${local.getUTCFullYear()}${String(local.getUTCMonth() + 1).padStart(2, '0')}${String(local.getUTCDate()).padStart(2, '0')}`;
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    const suffix = Array.from({ length: 5 }, () => alphabet[randomInt(0, alphabet.length)]).join('');
    return `${kind === 'afiliado' ? 'BLC' : 'BLA'}-${stamp}-${suffix}`;
  }

  /** Gera um contrato para o afiliado. Se já houver um do mesmo tipo aguardando assinatura, devolve esse (ou recusa, quando `strict`). */
  async create(afiliadoId: string, kind: ContractKind, options: { origem: 'cadastro' | 'painel' | 'automatico'; actorId?: string | null; notify?: boolean; strict?: boolean }) {
    const waiting = await this.prisma.contrato.findFirst({ where: { afiliadoId, tipo: kind, status: 'aguardando' } });
    if (waiting) {
      if (options.strict) throw new ConflictException('Este afiliado já tem um contrato deste tipo aguardando assinatura. Cancele o anterior para gerar outro.');
      return waiting;
    }
    const { affiliate, party } = await this.affiliateParty(afiliadoId);
    const company = await this.company();
    const date = new Date();
    const main = kind === 'aditivo-bonificacao'
      ? await this.prisma.contrato.findFirst({ where: { afiliadoId, tipo: 'afiliado', status: { in: ['assinado', 'aguardando'] } }, orderBy: [{ status: 'asc' }, { criadoEm: 'desc' }], select: { numero: true, criadoEm: true, assinadoEm: true } })
      : null;
    let created: Awaited<ReturnType<typeof this.prisma.contrato.create>> | null = null;
    for (let attempt = 0; attempt < 4 && !created; attempt += 1) {
      const numero = this.makeNumber(kind, date);
      const texto = buildContractText({ kind, numero, company: company.dados, affiliate: party, date, mainContract: main ? { numero: main.numero, data: main.assinadoEm ?? main.criadoEm } : null });
      const events: ContractEvent[] = [{ em: date.toISOString(), evento: 'gerado', detalhe: options.origem, ...(options.actorId ? { por: options.actorId } : {}) }];
      if (company.aprovacao) events.push({ em: date.toISOString(), evento: 'empresa_assinou', detalhe: `${company.aprovacao.nome} (modelo aprovado em ${dateTimeBr(company.aprovacao.em)})` });
      try {
        created = await this.prisma.contrato.create({
          data: {
            numero, tipo: kind, titulo: CONTRACT_TITLES[kind], texto, hash: textHash(texto), versaoModelo: CONTRACT_TEMPLATE_VERSION,
            partes: { empresa: company.dados, afiliado: { ...party, dataNascimento: party.dataNascimento?.toISOString() ?? null, afiliadoId } } as unknown as Prisma.InputJsonValue,
            origem: options.origem, afiliadoId, usuarioId: affiliate.usuarioId, criadoPorId: options.actorId ?? null,
            empresaHash: company.hash,
            ...(company.aprovacao ? { empresaAssinadaEm: new Date(company.aprovacao.em), empresaAssinatura: company.aprovacao as unknown as Prisma.InputJsonValue } : {}),
            eventos: events as unknown as Prisma.InputJsonValue,
          },
        });
      } catch (error) {
        if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
          const again = await this.prisma.contrato.findFirst({ where: { afiliadoId, tipo: kind, status: 'aguardando' } });
          if (again) { if (options.strict) throw new ConflictException('Este afiliado já tem um contrato deste tipo aguardando assinatura.'); return again; }
          continue;
        }
        throw error;
      }
    }
    if (!created) throw new ConflictException('Não foi possível gerar o número do contrato. Tente de novo.');
    await this.audit.record(this.prisma, { entidade: 'contrato', entidadeId: created.id, evento: 'contrato.gerado', atorId: options.actorId ?? affiliate.usuarioId, payloadDepois: { numero: created.numero, tipo: kind, origem: options.origem, afiliadoId, hash: created.hash } });
    if (options.notify) await this.notifyReady(created.id).catch(() => undefined);
    return created;
  }

  /** Avisa o afiliado (e-mail e aviso no app) que há contrato para assinar. Nunca lança. */
  private async notifyReady(contractId: string, reminder = false): Promise<boolean> {
    const contract = await this.prisma.contrato.findUnique({ where: { id: contractId } });
    if (!contract?.usuarioId || contract.status !== 'aguardando') return false;
    const user = await this.prisma.usuario.findUnique({ where: { id: contract.usuarioId }, select: { nome: true, email: true } });
    if (!user) return false;
    const link = `${this.mail.publicUrl()}/afiliado?aba=contrato`;
    const first = user.nome.split(' ')[0] ?? user.nome;
    const sent = await this.mail.send({
      to: user.email,
      subject: reminder ? `Lembrete: assine o seu contrato de afiliado (${contract.numero})` : `Seu contrato de afiliado está pronto para assinar (${contract.numero})`,
      text: `Olá, ${first}. O documento "${contract.titulo}" nº ${contract.numero} já está preenchido com os seus dados. Para assinar, entre no app do afiliado, abra "Contrato" e confirme com o código que enviaremos ao seu e-mail: ${link}`,
      html: wrapEmailHtml(reminder ? 'Seu contrato aguarda assinatura' : 'Seu contrato está pronto', `<p>Olá, ${escapeHtml(first)}.</p><p>O documento <strong>${escapeHtml(contract.titulo)}</strong> nº ${escapeHtml(contract.numero)} já está preenchido com os seus dados.</p><p>Para assinar, abra o app do afiliado em <strong>Contrato</strong> e confirme com o código que enviaremos ao seu e-mail.</p>`, { label: 'Ver e assinar o contrato', url: link }),
    });
    await this.prisma.notificacao.create({ data: { usuarioId: contract.usuarioId, canal: 'push', tipo: 'contrato.assinar', payload: { titulo: 'Contrato para assinar', mensagem: `${contract.titulo} nº ${contract.numero} está pronto. Toque para ler e assinar.`, link: '/afiliado?aba=contrato' } } }).catch(() => undefined);
    await this.pushEvent(contract.id, { em: new Date().toISOString(), evento: reminder ? 'lembrete_enviado' : 'aviso_enviado', detalhe: sent ? maskEmail(user.email) : 'e-mail não enviado' });
    return sent;
  }

  private async pushEvent(id: string, event: ContractEvent): Promise<void> {
    const row = await this.prisma.contrato.findUnique({ where: { id }, select: { eventos: true } });
    if (!row) return;
    await this.prisma.contrato.update({ where: { id }, data: { eventos: [...((row.eventos as ContractEvent[] | null) ?? []), event] as unknown as Prisma.InputJsonValue } });
  }

  /** Garante o contrato principal do afiliado (não gera de novo se já houver um aguardando ou assinado). */
  async ensureAffiliateContract(afiliadoId: string, origem: 'cadastro' | 'painel' | 'automatico', notify: boolean, actorId?: string | null) {
    const existing = await this.prisma.contrato.findFirst({ where: { afiliadoId, tipo: 'afiliado', status: { in: ['aguardando', 'assinado'] } }, orderBy: { criadoEm: 'desc' } });
    if (existing) return { contrato: existing, criado: false };
    return { contrato: await this.create(afiliadoId, 'afiliado', { origem, notify, actorId }), criado: true };
  }

  /** A cada 5 minutos: afiliados cadastrados nos últimos 3 dias sem contrato recebem o contrato já preenchido. */
  @Cron('*/5 * * * *')
  async autoGenerate(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const since = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
      const affiliates = await this.prisma.afiliado.findMany({ where: { criadoEm: { gte: since }, statusAprovacao: { notIn: ['rejeitado', 'recusado', 'inativo'] }, contratos: { none: { tipo: 'afiliado' } }, usuario: { desativadoEm: null } }, select: { id: true }, take: 50 });
      for (const affiliate of affiliates) {
        await this.ensureAffiliateContract(affiliate.id, 'cadastro', true).catch((error) => this.logger.warn(`Contrato do afiliado ${affiliate.id} não gerado: ${error instanceof Error ? error.message : String(error)}`));
      }
    } catch (error) {
      this.logger.error(`Rotina de contratos falhou: ${error instanceof Error ? error.message : String(error)}`);
    } finally {
      this.running = false;
    }
  }

  /** Painel: gera o contrato para todos os afiliados que ainda não têm (avisa cada um por e-mail). */
  async generateMissing(actor: AuthUser) {
    const affiliates = await this.prisma.afiliado.findMany({ where: { statusAprovacao: 'aprovado', contratos: { none: { tipo: 'afiliado', status: { in: ['aguardando', 'assinado'] } } }, usuario: { desativadoEm: null } }, select: { id: true }, take: 500 });
    let gerados = 0;
    for (const affiliate of affiliates) {
      const result = await this.ensureAffiliateContract(affiliate.id, 'painel', true, actor.id).catch(() => null);
      if (result?.criado) gerados += 1;
    }
    return { gerados };
  }

  // ---------- Painel ----------

  private summary(row: { id: string; numero: string; tipo: string; titulo: string; status: string; origem: string; criadoEm: Date; assinadoEm: Date | null; empresaAssinadaEm: Date | null; hash: string; partes: Prisma.JsonValue; afiliadoId: string | null; canceladoEm: Date | null; motivoCancelamento: string | null; codigoEnviadoEm: Date | null }) {
    const partes = (row.partes ?? {}) as { afiliado?: { nome?: string; codigoAfiliado?: string; email?: string; cpf?: string } };
    return {
      id: row.id, numero: row.numero, tipo: row.tipo, titulo: row.titulo, status: row.status, origem: row.origem, criadoEm: row.criadoEm, assinadoEm: row.assinadoEm,
      empresaAssinadaEm: row.empresaAssinadaEm, hash: row.hash, canceladoEm: row.canceladoEm, motivoCancelamento: row.motivoCancelamento, codigoEnviadoEm: row.codigoEnviadoEm,
      afiliado: { id: row.afiliadoId, nome: partes.afiliado?.nome ?? '—', codigo: partes.afiliado?.codigoAfiliado ?? null, email: partes.afiliado?.email ?? null, cpf: partes.afiliado?.cpf ? formatCpf(partes.afiliado.cpf) : null },
    };
  }

  async list(query: { status?: string; tipo?: string; busca?: string; page?: number }) {
    const page = Math.max(1, Math.trunc(Number(query.page) || 1));
    const pageSize = 30;
    const busca = query.busca?.trim().slice(0, 80);
    const digits = busca?.replace(/\D/g, '') ?? '';
    const where: Prisma.ContratoWhereInput = {
      ...(query.status && (STATUS as readonly string[]).includes(query.status) ? { status: query.status } : {}),
      ...(query.tipo ? { tipo: query.tipo } : {}),
      ...(busca ? { OR: [
        { numero: { contains: busca, mode: 'insensitive' } },
        { afiliado: { codigoAfiliado: { contains: busca, mode: 'insensitive' } } },
        { afiliado: { usuario: { nome: { contains: busca, mode: 'insensitive' } } } },
        { afiliado: { usuario: { email: { contains: busca, mode: 'insensitive' } } } },
        ...(digits.length >= 3 ? [{ afiliado: { usuario: { cpf: { contains: digits } } } }] : []),
      ] } : {}),
    };
    const [rows, total, counts, companyPending] = await Promise.all([
      this.prisma.contrato.findMany({ where, orderBy: { criadoEm: 'desc' }, skip: (page - 1) * pageSize, take: pageSize }),
      this.prisma.contrato.count({ where }),
      this.prisma.contrato.groupBy({ by: ['status'], _count: { _all: true } }),
      this.prisma.contrato.count({ where: { empresaAssinadaEm: null, status: { not: 'cancelado' } } }),
    ]);
    const resumo = Object.fromEntries(STATUS.map((key) => [key, counts.find((item) => item.status === key)?._count._all ?? 0]));
    return { items: rows.map((row) => this.summary(row)), pagination: { page, pageSize, total, pages: Math.ceil(total / pageSize) }, resumo: { ...resumo, empresaPendente: companyPending } };
  }

  async detail(id: string) {
    const row = await this.prisma.contrato.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Contrato não encontrado.');
    return { ...this.summary(row), texto: row.texto, versaoModelo: row.versaoModelo, partes: row.partes, assinatura: row.assinatura, empresaAssinatura: row.empresaAssinatura, eventos: row.eventos, verificacao: this.verifyUrl(row.numero, row.hash) };
  }

  /** Afiliados para o seletor de "Gerar contrato", com a situação do contrato principal. */
  async affiliateOptions() {
    const affiliates = await this.prisma.afiliado.findMany({ where: { usuario: { desativadoEm: null } }, select: { id: true, codigoAfiliado: true, statusAprovacao: true, usuario: { select: { nome: true } }, contratos: { where: { tipo: 'afiliado', status: { in: ['aguardando', 'assinado'] } }, select: { status: true }, orderBy: { criadoEm: 'desc' }, take: 1 } }, take: 2000 });
    return affiliates
      .map((item) => ({ id: item.id, nome: item.usuario.nome, codigo: item.codigoAfiliado, statusAprovacao: item.statusAprovacao, contrato: item.contratos[0]?.status ?? null }))
      .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));
  }

  async cancel(id: string, actor: AuthUser, motivo: string) {
    const row = await this.prisma.contrato.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Contrato não encontrado.');
    if (row.status === 'cancelado') throw new ConflictException('Este contrato já está cancelado.');
    const now = new Date();
    const events = [...((row.eventos as ContractEvent[] | null) ?? []), { em: now.toISOString(), evento: 'cancelado', detalhe: motivo, por: actor.id }];
    const updated = await this.prisma.contrato.update({ where: { id }, data: { status: 'cancelado', canceladoEm: now, canceladoPorId: actor.id, motivoCancelamento: motivo.slice(0, 300), codigoHash: null, eventos: events as unknown as Prisma.InputJsonValue } });
    await this.audit.record(this.prisma, { entidade: 'contrato', entidadeId: id, evento: 'contrato.cancelado', atorId: actor.id, payloadAntes: { status: row.status }, payloadDepois: { status: 'cancelado', motivo } });
    return this.summary(updated);
  }

  async remind(id: string, actor: AuthUser) {
    const row = await this.prisma.contrato.findUnique({ where: { id }, select: { status: true } });
    if (!row) throw new NotFoundException('Contrato não encontrado.');
    if (row.status !== 'aguardando') throw new ConflictException('Só dá para lembrar contratos que aguardam assinatura.');
    const sent = await this.notifyReady(id, true);
    await this.audit.record(this.prisma, { entidade: 'contrato', entidadeId: id, evento: 'contrato.lembrete', atorId: actor.id, payloadDepois: { enviado: sent } });
    if (!sent) throw new ConflictException('O aviso apareceu no app do afiliado, mas o e-mail não foi enviado. Confira o e-mail do sistema em Integrações.');
    return { enviado: true };
  }

  // ---------- Afiliado ----------

  private async affiliateOf(user: AuthUser) {
    const affiliate = await this.prisma.afiliado.findUnique({ where: { usuarioId: user.id }, select: { id: true } });
    if (!affiliate) throw new ForbiddenException('Somente afiliados têm contrato.');
    return affiliate;
  }

  private async ownContract(user: AuthUser, id: string) {
    const affiliate = await this.affiliateOf(user);
    const row = await this.prisma.contrato.findUnique({ where: { id } });
    if (!row || row.afiliadoId !== affiliate.id) throw new NotFoundException('Contrato não encontrado.');
    return row;
  }

  async mine(user: AuthUser) {
    const affiliate = await this.affiliateOf(user);
    await this.ensureAffiliateContract(affiliate.id, 'cadastro', false).catch((error) => this.logger.warn(`Contrato não gerado ao abrir o app: ${error instanceof Error ? error.message : String(error)}`));
    const rows = await this.prisma.contrato.findMany({ where: { afiliadoId: affiliate.id, status: { not: 'cancelado' } }, orderBy: { criadoEm: 'desc' } });
    const account = await this.prisma.usuario.findUnique({ where: { id: user.id }, select: { email: true } });
    return {
      email: account ? maskEmail(account.email) : null,
      items: rows.map((row) => ({
        id: row.id, numero: row.numero, tipo: row.tipo, titulo: row.titulo, status: row.status, criadoEm: row.criadoEm, assinadoEm: row.assinadoEm, hash: row.hash,
        texto: row.texto, empresaAssinadaEm: row.empresaAssinadaEm, codigoEnviadoEm: row.codigoEnviadoEm, codigoValido: Boolean(row.codigoHash && row.codigoExpiraEm && row.codigoExpiraEm.getTime() > Date.now()),
      })),
      pendentes: rows.filter((row) => row.status === 'aguardando').length,
    };
  }

  async requestCode(user: AuthUser, id: string, meta: SignatureMeta) {
    const row = await this.ownContract(user, id);
    if (row.status !== 'aguardando') throw new ConflictException(row.status === 'assinado' ? 'Este contrato já está assinado.' : 'Este contrato foi cancelado.');
    const now = Date.now();
    if (row.codigoEnviadoEm && now - row.codigoEnviadoEm.getTime() < RESEND_MS) throw new HttpException('Aguarde 1 minuto para pedir outro código.', HttpStatus.TOO_MANY_REQUESTS);
    const sendsToday = row.codigoEnviadoEm && now - row.codigoEnviadoEm.getTime() < 24 * 60 * 60 * 1000 ? row.codigoEnvios : 0;
    if (sendsToday >= MAX_SENDS_PER_DAY) throw new HttpException('Limite de códigos do dia atingido. Tente amanhã ou fale com a administração.', HttpStatus.TOO_MANY_REQUESTS);
    const account = await this.prisma.usuario.findUniqueOrThrow({ where: { id: user.id }, select: { nome: true, email: true } });
    const code = this.newCode();
    const first = account.nome.split(' ')[0] ?? account.nome;
    const sent = await this.mail.send({
      to: account.email,
      subject: `Código para assinar o contrato ${row.numero}`,
      text: `Olá, ${first}. Seu código para assinar o documento "${row.titulo}" nº ${row.numero} é ${code}. Ele vale por 15 minutos. Ao digitar este código você confirma que leu e aceita o contrato. Se não foi você, ignore este e-mail e avise a administração do BL.`,
      html: wrapEmailHtml('Código para assinar o contrato', `<p>Olá, ${escapeHtml(first)}.</p><p>Seu código para assinar o documento <strong>${escapeHtml(row.titulo)}</strong> nº ${escapeHtml(row.numero)} é:</p><p style="font-size:30px;font-weight:700;letter-spacing:6px;margin:18px 0">${code}</p><p>Ele vale por 15 minutos. Ao digitar este código você confirma que leu e aceita o contrato.</p><p style="color:#646b86">Se não foi você, ignore este e-mail e avise a administração do BL.</p>`),
    });
    if (!sent) throw new ConflictException('Não conseguimos enviar o e-mail agora. Tente de novo em alguns minutos.');
    const events = [...((row.eventos as ContractEvent[] | null) ?? []), { em: new Date(now).toISOString(), evento: 'codigo_enviado', detalhe: maskEmail(account.email), ip: meta.ip }];
    await this.prisma.contrato.update({ where: { id }, data: { codigoHash: this.codeHash(`contrato:${row.id}:${row.hash}`, code), codigoExpiraEm: new Date(now + CODE_TTL_MS), codigoTentativas: 0, codigoEnviadoEm: new Date(now), codigoEnvios: sendsToday + 1, eventos: events as unknown as Prisma.InputJsonValue } });
    return { enviado: true, email: maskEmail(account.email), validoAte: new Date(now + CODE_TTL_MS) };
  }

  async sign(user: AuthUser, id: string, code: string, device: DeviceInfo | undefined, meta: SignatureMeta) {
    const row = await this.ownContract(user, id);
    if (row.status !== 'aguardando') throw new ConflictException(row.status === 'assinado' ? 'Este contrato já está assinado.' : 'Este contrato foi cancelado.');
    if (!row.codigoHash || !row.codigoExpiraEm) throw new BadRequestException('Peça o código de confirmação primeiro.');
    if (row.codigoExpiraEm.getTime() < Date.now()) throw new BadRequestException('O código venceu. Peça um novo.');
    if (row.codigoTentativas >= MAX_ATTEMPTS) throw new BadRequestException('Muitas tentativas. Peça um novo código.');
    if (row.hash !== textHash(row.texto)) throw new ConflictException('O texto deste contrato não confere. Fale com a administração.');
    const expected = this.codeHash(`contrato:${row.id}:${row.hash}`, code.replace(/\D/g, ''));
    if (!this.sameHash(row.codigoHash, expected)) {
      const attempts = row.codigoTentativas + 1;
      const events = [...((row.eventos as ContractEvent[] | null) ?? []), { em: new Date().toISOString(), evento: 'codigo_incorreto', ip: meta.ip }];
      await this.prisma.contrato.update({ where: { id }, data: { codigoTentativas: attempts, ...(attempts >= MAX_ATTEMPTS ? { codigoHash: null } : {}), eventos: events as unknown as Prisma.InputJsonValue } });
      throw new BadRequestException(attempts >= MAX_ATTEMPTS ? 'Código incorreto. Peça um novo código.' : `Código incorreto. Você ainda tem ${MAX_ATTEMPTS - attempts} ${MAX_ATTEMPTS - attempts === 1 ? 'tentativa' : 'tentativas'}.`);
    }
    const account = await this.prisma.usuario.findUniqueOrThrow({ where: { id: user.id }, select: { nome: true, email: true, cpf: true } });
    const now = new Date();
    const signature = {
      metodo: 'Código numérico de uso único enviado ao e-mail cadastrado',
      nome: account.nome, cpf: formatCpf(account.cpf), email: account.email, usuarioId: user.id,
      ip: meta.ip, ipsEncaminhados: meta.forwardedFor, userAgent: meta.userAgent,
      ...cleanDevice(device),
      codigoEnviadoEm: row.codigoEnviadoEm?.toISOString() ?? null, assinadoEm: now.toISOString(), hash: row.hash,
    };
    const events = [...((row.eventos as ContractEvent[] | null) ?? []), { em: now.toISOString(), evento: 'assinado', detalhe: `${account.nome} (${maskEmail(account.email)})`, ip: meta.ip }];
    const updated = await this.prisma.contrato.updateMany({ where: { id, status: 'aguardando', codigoHash: row.codigoHash }, data: { status: 'assinado', assinadoEm: now, assinatura: signature as unknown as Prisma.InputJsonValue, codigoHash: null, codigoExpiraEm: null, eventos: events as unknown as Prisma.InputJsonValue } });
    if (updated.count !== 1) throw new ConflictException('Este contrato mudou enquanto você assinava. Recarregue a página.');
    await this.audit.record(this.prisma, { entidade: 'contrato', entidadeId: id, evento: 'contrato.assinado', atorId: user.id, payloadDepois: { numero: row.numero, hash: row.hash, ip: meta.ip } });
    // Cópia do contrato assinado por e-mail (falha no envio não desfaz a assinatura).
    try {
      const pdf = await this.pdf(id);
      await this.mail.send({
        to: account.email,
        subject: `Contrato assinado: ${row.numero}`,
        text: `Seu documento "${row.titulo}" nº ${row.numero} foi assinado em ${dateTimeBr(now)}. A cópia em PDF segue anexa e também fica no app do afiliado, em Contrato.`,
        html: wrapEmailHtml('Contrato assinado', `<p>Seu documento <strong>${escapeHtml(row.titulo)}</strong> nº ${escapeHtml(row.numero)} foi assinado em ${escapeHtml(dateTimeBr(now))}.</p><p>A cópia em PDF segue anexa e também fica no app do afiliado, em <strong>Contrato</strong>.</p>`),
        attachments: [{ filename: pdf.filename, content: pdf.buffer, contentType: 'application/pdf' }],
      });
    } catch (error) {
      this.logger.warn(`Cópia do contrato ${row.numero} não enviada: ${error instanceof Error ? error.message : String(error)}`);
    }
    return { status: 'assinado', assinadoEm: now, numero: row.numero, hash: row.hash };
  }

  async ownPdf(user: AuthUser, id: string) {
    await this.ownContract(user, id);
    return this.pdf(id);
  }

  // ---------- PDF e verificação ----------

  async pdf(id: string) {
    const row = await this.prisma.contrato.findUnique({ where: { id } });
    if (!row) throw new NotFoundException('Contrato não encontrado.');
    const partes = (row.partes ?? {}) as { empresa?: CompanyData; afiliado?: AffiliateParty & { cpf: string } };
    const signature = (row.assinatura ?? null) as Record<string, unknown> | null;
    const company = (row.empresaAssinatura ?? null) as CompanyApproval | null;
    const events = ((row.eventos as ContractEvent[] | null) ?? []);
    const statusText = row.status === 'assinado' ? 'Assinado pelo afiliado' : row.status === 'cancelado' ? `Cancelado em ${dateTimeBr(row.canceladoEm)}${row.motivoCancelamento ? ` — ${row.motivoCancelamento}` : ''}` : 'Aguardando assinatura do afiliado';
    const blocks: CertificateBlock[] = [
      { title: 'Documento', rows: [['Número', row.numero], ['Tipo', row.titulo], ['Situação', statusText], ['Gerado em', dateTimeBr(row.criadoEm)], ['Versão do modelo', row.versaoModelo]] },
      { title: 'Contratante', rows: [
        ['Empresa', `${partes.empresa?.razaoSocial ?? '—'} — CNPJ ${partes.empresa?.cnpj ?? '—'}`],
        ['Representante legal', `${partes.empresa?.representanteNome ?? '—'} — CPF ${partes.empresa?.representanteCpf ?? '—'}`],
        ['Assinatura', company ? `Modelo aprovado eletronicamente em ${dateTimeBr(company.em)} por ${company.nome} (${maskEmail(company.email)}), com código enviado ao e-mail` : 'Pendente: o modelo ainda não foi aprovado pelo representante legal'],
        ...(company ? [['IP da aprovação', company.ip] as const, ['Local da aprovação', localText(company.local)] as const] : []),
      ] },
      { title: 'Afiliado', rows: [
        ['Nome', partes.afiliado?.nome ?? '—'], ['CPF', partes.afiliado?.cpf ? formatCpf(partes.afiliado.cpf) : '—'], ['E-mail', partes.afiliado?.email ? maskEmail(partes.afiliado.email) : '—'],
        ['Assinado em', signature ? dateTimeBr(String(signature.assinadoEm)) : '—'],
        ['Método', signature ? String(signature.metodo) : '—'],
        ['Código enviado em', signature?.codigoEnviadoEm ? dateTimeBr(String(signature.codigoEnviadoEm)) : '—'],
        ['Endereço IP', signature ? String(signature.ip ?? '—') : '—'],
        ['Localização do aparelho', signature ? localText(signature) : '—'],
        ['Dispositivo e navegador', signature ? String(signature.userAgent ?? '—').slice(0, 220) : '—'],
        ['Fuso e idioma', signature ? [signature.fuso, signature.idioma].filter(Boolean).join(' · ') || '—' : '—'],
      ] },
      { title: 'Histórico', rows: events.map((event) => [dateTimeBr(event.em).replace(' (horário de Brasília)', ''), `${{ gerado: 'Contrato gerado', aviso_enviado: 'Aviso enviado ao afiliado', lembrete_enviado: 'Lembrete enviado', codigo_enviado: 'Código enviado para', codigo_incorreto: 'Código incorreto digitado', assinado: 'Assinado por', empresa_assinou: 'Assinatura da contratante', cancelado: 'Cancelado' }[event.evento] ?? event.evento}${event.detalhe && event.evento !== 'gerado' ? ` ${event.detalhe}` : ''}${event.ip ? ` · IP ${event.ip}` : ''}`] as const) },
    ];
    const buffer = await buildContractPdf({ numero: row.numero, titulo: row.titulo, texto: row.texto, hash: row.hash, status: row.status, blocks, verifyUrl: this.verifyUrl(row.numero, row.hash), footer: `${partes.empresa?.razaoSocial ?? 'BL — Bolão Livre'} · ${longDate(row.criadoEm)}` });
    return { buffer, filename: `${row.numero}.pdf` };
  }

  /** Verificação pública: confere número + código (hash) sem expor dados pessoais. */
  async verify(numero: string, codigo: string) {
    const row = await this.prisma.contrato.findUnique({ where: { numero: numero.trim().toUpperCase() } });
    const ok = Boolean(row && codigo && this.sameHash(row.hash, codigo.trim().toLowerCase()));
    if (!row || !ok) return { valido: false };
    const partes = (row.partes ?? {}) as { empresa?: CompanyData; afiliado?: { nome?: string } };
    const name = (partes.afiliado?.nome ?? '').trim().split(/\s+/);
    return {
      valido: true, numero: row.numero, titulo: row.titulo, status: row.status, criadoEm: row.criadoEm, assinadoEm: row.assinadoEm, empresaAssinadaEm: row.empresaAssinadaEm,
      contratante: partes.empresa ? `${partes.empresa.razaoSocial} — CNPJ ${partes.empresa.cnpj}` : null,
      afiliado: name.length ? `${name[0]}${name.length > 1 ? ` ${name[name.length - 1]![0]}.` : ''}` : null,
    };
  }
}
