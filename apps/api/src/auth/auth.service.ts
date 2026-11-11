import { assertCanManage, isSuperAdmin } from '../admin/superadmin';
import { ConflictException, ForbiddenException, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { sessionIdleMinutes } from './session-policy';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import { legalDocument } from '../legal/documents';
import { recordAccountAcceptances } from '../legal/account-acceptance';
import * as argon2 from 'argon2';
import { AuditService } from '../common/audit.service';
import { escapeHtml, MailService, wrapEmailHtml } from '../common/mail.service';
import { PrismaService } from '../common/prisma.service';
import { RegisterDto, LoginDto, GoogleSignupDto } from './auth.dto';
import { assertAdult, AuthUser, isValidCpf, normalizeCpf } from './auth.utils';
import { normalizePixKey, PIX_KEY_MESSAGE } from '../account/pix-key';
import { isValidNewPassword, NEW_PASSWORD_MESSAGE } from './password-policy';
import { GOOGLE_LOGIN_ROLES, GoogleIdentity, verifyGoogleIdToken } from './google';
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, openSecret, otpauthUrl, sealSecret, verifyTotp } from './totp';

const GENERIC_LOGIN_ERROR = 'E-mail ou senha incorretos, ou conta temporariamente bloqueada por excesso de tentativas. Tente novamente em alguns minutos.';

import { ensureAffiliateGroup, joinAffiliateGroup } from '../common/affiliate-groups';
/** Convite da equipe só vale se quem gerou é administrador ativo; convite de administrador, só se foi o superadmin. */
export function isStaffInviteUsable(invite: { tipo: string; criadoPorUsuario?: { papel?: string | null; email?: string | null; desativadoEm?: Date | null } | null }): boolean {
  const creator = invite.criadoPorUsuario;
  if (!creator || creator.papel !== 'admin' || creator.desativadoEm) return false;
  return invite.tipo === 'admin' ? isSuperAdmin({ papel: creator.papel, email: creator.email }) : true;
}

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Optional() private readonly audit?: AuditService,
    @Optional() private readonly mail?: MailService,
  ) {}

  private dummyHash?: Promise<string>;

  async register(dto: RegisterDto, meta: { ip?: string; userAgent?: string | null } = {}): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    const cpf = normalizeCpf(dto.cpf);
    if (!isValidCpf(cpf)) throw new ConflictException('CPF inválido.');
    // Cadastro simples: sem data de nascimento, vale a declaração de que a pessoa tem 18 anos ou mais.
    let dataNascimento: Date | null = null;
    if (dto.dataNascimento) {
      dataNascimento = new Date(dto.dataNascimento);
      if (Number.isNaN(dataNascimento.getTime())) throw new ConflictException('Data de nascimento inválida.');
      assertAdult(dataNascimento);
    } else if (dto.maiorDeIdade !== true) {
      throw new ConflictException('Confirme que você tem 18 anos ou mais para criar a conta.');
    }
    if (!isValidNewPassword(dto.senha)) throw new ConflictException(NEW_PASSWORD_MESSAGE);
    if (dto.confirmarSenha !== dto.senha) throw new ConflictException('As senhas não são iguais. Digite a mesma senha nos dois campos.');
    const pix = dto.chavePix?.trim() ? normalizePixKey(dto.chavePix) : null;
    if (dto.chavePix?.trim() && !pix) throw new ConflictException(PIX_KEY_MESSAGE);
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.usuario.findFirst({ where: { OR: [{ cpf }, { email }] } });
    if (existing) throw new ConflictException('CPF ou e-mail já cadastrado.');

    const code = dto.codigoAfiliado?.trim();
    const invite = code
      ? await this.prisma.convite.findFirst({ where: { codigo: code, status: 'ativo', expiraEm: { gt: new Date() } }, select: { id: true, tipo: true, afiliadoOrigemId: true, grupoId: true, emailDestino: true, comissaoPct: true, criadoPorUsuario: { select: { papel: true, id: true, email: true, desativadoEm: true } } } })
      : null;
    if (invite?.emailDestino && invite.emailDestino.toLowerCase() !== email) throw new ConflictException('Este convite foi direcionado a outro e-mail.');

    const directAffiliate = !invite && code
      ? await this.prisma.afiliado.findUnique({ where: { codigoAfiliado: code }, select: { id: true, statusAprovacao: true } })
      : null;
    // Código de indicação de outro cliente (link "Indicar amigos"): vale só como vínculo de quem indicou.
    const clientReferrer = code && !invite && !directAffiliate
      ? await this.prisma.usuario.findUnique({ where: { codigoIndicacao: code.toUpperCase() }, select: { id: true, desativadoEm: true } })
      : null;
    if (code && !invite && !clientReferrer && (!directAffiliate || directAffiliate.statusAprovacao !== 'aprovado')) throw new ConflictException('Código de indicação inválido ou inativo.');
    // Afiliado só entra por convite feito pelo administrador do BL. Convite de afiliado vindo de outra origem não vale.
    if (invite?.tipo === 'afiliado' && invite.criadoPorUsuario?.papel !== 'admin') throw new ConflictException('Este convite de afiliado não é válido. Peça um novo convite ao administrador do BL.');
    // Link da equipe (operação ou administrador): só vale se quem gerou ainda é administrador ativo com direito de conceder o papel.
    if ((invite?.tipo === 'operacao' || invite?.tipo === 'admin') && !isStaffInviteUsable(invite)) throw new ConflictException('Este link de cadastro da equipe não é mais válido. Peça um novo ao administrador.');
    // Contrato do afiliado: a comissão é a que o administrador definiu no convite e o aceite é gravado junto com o cadastro.
    const contract = invite?.tipo === 'afiliado' ? legalDocument('afiliado', invite.comissaoPct ? Number(invite.comissaoPct).toFixed(2) : undefined) : null;
    if (contract?.aprovado && dto.aceiteContratoHash !== contract.hash) throw new ConflictException('Leia e aceite o contrato de afiliação para concluir o cadastro.');
    const originAffiliateId = invite?.afiliadoOrigemId ?? directAffiliate?.id ?? null;
    const papel = invite?.tipo === 'afiliado' ? 'afiliado' : invite?.tipo === 'operacao' ? 'operacao' : invite?.tipo === 'admin' ? 'admin' : 'cotista';
    const staffSignup = papel === 'operacao' || papel === 'admin';
    const passwordHash = await argon2.hash(dto.senha, { type: argon2.argon2id });

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.usuario.create({
        data: {
          nome: dto.nome.trim(),
          cpf,
          email,
          telefone: dto.telefone.replace(/\D/g, ''),
          dataNascimento,
          ...(pix ? { chavePixRecebimento: pix.valor } : {}),
          ...(dto.endereco ? { enderecoCep: dto.endereco.cep, enderecoLogradouro: dto.endereco.logradouro, enderecoNumero: dto.endereco.numero, enderecoComplemento: dto.endereco.complemento || null, enderecoBairro: dto.endereco.bairro, enderecoCidade: dto.endereco.cidade, enderecoUf: dto.endereco.uf } : {}),
          senhaHash: passwordHash,
          papel,
          indicadoPorAfiliadoId: originAffiliateId ?? undefined,
          ...(clientReferrer && !clientReferrer.desativadoEm && papel === 'cotista' ? { indicadoPorUsuarioId: clientReferrer.id } : {}),
        },
        select: { id: true, email: true, papel: true },
      });
      await recordAccountAcceptances(tx, created.id, meta);
      if (invite?.tipo === 'afiliado') {
        // Convite feito por um administrador já vale como aprovação, com a comissão que ele definiu.
        const approvedByAdmin = invite.criadoPorUsuario?.papel === 'admin';
        const affiliate = await tx.afiliado.create({
          data: {
            usuarioId: created.id,
            codigoAfiliado: this.makeCode('BL'),
            statusAprovacao: approvedByAdmin ? 'aprovado' : 'pendente',
            ...(invite.comissaoPct ? { comissaoPadraoPct: invite.comissaoPct } : {}),
            parentAfiliadoId: originAffiliateId ?? undefined,
            chavePixRepasse: dto.chavePixRepasse?.trim() || undefined,
            ...(approvedByAdmin ? { aprovadoPor: invite.criadoPorUsuario!.id, aprovadoEm: new Date() } : {}),
          },
        });
        if (contract?.aprovado) {
          const accepted = await tx.aceiteLegal.create({ data: { usuarioId: created.id, tipo: 'afiliado', hash: contract.hash, versao: contract.versao, texto: contract.texto, ip: meta.ip ?? 'unknown', userAgent: meta.userAgent ?? undefined } });
          await this.audit?.record(tx, { entidade: 'usuario', entidadeId: created.id, evento: 'contrato.afiliado_aceito', atorId: created.id, payloadDepois: { hash: contract.hash, aceiteId: accepted.id, origem: 'cadastro', comissaoPct: Number(affiliate.comissaoPadraoPct) } });
        }
        await this.audit?.record(tx, { entidade: 'afiliado', entidadeId: affiliate.id, evento: 'afiliado.cadastro_concluido', atorId: created.id, payloadDepois: { conviteId: invite.id, comissaoPct: Number(affiliate.comissaoPadraoPct), aprovadoPor: invite.criadoPorUsuario?.id ?? null } });
        if (approvedByAdmin) {
          await ensureAffiliateGroup(tx, affiliate, dto.nome, invite.criadoPorUsuario!.id);
          await tx.notificacao.create({ data: { usuarioId: created.id, canal: 'push', tipo: 'afiliado.aprovado', payload: { titulo: 'Seu cadastro de afiliado foi aprovado', mensagem: 'Seu grupo já está pronto. Crie seu bolão e envie o link de venda aos seus cotistas.', link: '/afiliado' } } });
        }
      }
      // Convite de grupo: a pessoa já entra no grupo do afiliado (isso conta para o limite de cotas do grupo).
      if (invite?.grupoId && invite.tipo === 'usuario') {
        await tx.grupoMembro.upsert({ where: { grupoId_usuarioId: { grupoId: invite.grupoId, usuarioId: created.id } }, create: { grupoId: invite.grupoId, usuarioId: created.id }, update: {} });
      }
      // Cotista trazido por um afiliado (link de indicação ou convite sem grupo): entra no grupo do afiliado.
      if (papel === 'cotista' && originAffiliateId && !invite?.grupoId) await joinAffiliateGroup(tx, originAffiliateId, created.id);
      if (invite) {
        const marked = await tx.convite.updateMany({ where: { id: invite.id, status: 'ativo' }, data: { status: 'usado', usadoPorUsuarioId: created.id, usadoEm: new Date() } });
        if (marked.count !== 1) throw new ConflictException('Este convite já foi utilizado.');
      }
      if (staffSignup) await this.audit?.record(tx, { entidade: 'usuario', entidadeId: created.id, evento: 'equipe.cadastro_por_link', atorId: created.id, payloadDepois: { papel, conviteId: invite?.id ?? null, criadoPor: invite?.criadoPorUsuario?.id ?? null } });
      return created;
    });
    // Boas-vindas por e-mail (não atrapalha o cadastro se o envio falhar).
    if (this.mail?.isConfigured()) {
      const first = dto.nome.trim().split(' ')[0] ?? '';
      const url = this.mail.publicUrl();
      void this.mail.send({
        to: user.email,
        subject: 'Bem-vindo ao BL — Bolão Livre',
        text: `Olá, ${first}!\n\nSua conta no BL — Bolão Livre foi criada. Você já pode escolher um bolão e reservar suas cotas.\n\n${url}\n\nSe não foi você, responda este e-mail.`,
        html: wrapEmailHtml('Sua conta está pronta', `<p>Olá, ${escapeHtml(first)}!</p><p>Sua conta no BL — Bolão Livre foi criada. Você já pode escolher um bolão e reservar suas cotas.</p><p style="color:#646b86">Se não foi você, responda este e-mail.</p>`, { label: 'Ver bolões', url }),
      }).catch(() => undefined);
    }
    return this.issueTokens({ ...user, tokenVersion: 0 });
  }

  /** Explica o código do link: convite (afiliado ou cliente) ou indicação de afiliado. Não revela nada se não existir. */
  async inviteInfo(rawCode: string) {
    const code = (rawCode ?? '').trim().slice(0, 40);
    const invalid = { valido: false as const };
    if (code.length < 3) return invalid;
    const invite = await this.prisma.convite.findFirst({
      where: { codigo: code, status: 'ativo', expiraEm: { gt: new Date() } },
      select: { tipo: true, emailDestino: true, comissaoPct: true, criadoPorUsuario: { select: { nome: true, papel: true, email: true, desativadoEm: true } }, afiliadoOrigem: { select: { usuario: { select: { nome: true } } } }, grupo: { select: { nome: true } } },
    });
    const firstName = (name?: string | null) => (name ?? '').trim().split(/\s+/)[0] || null;
    if (invite) {
      // Convite de afiliado só vale quando feito pelo administrador (mesma regra do cadastro).
      if (invite.tipo === 'afiliado' && invite.criadoPorUsuario.papel !== 'admin') return invalid;
      if (invite.tipo === 'operacao' || invite.tipo === 'admin') {
        if (!isStaffInviteUsable({ tipo: invite.tipo, criadoPorUsuario: invite.criadoPorUsuario })) return invalid;
        return { valido: true as const, tipo: 'equipe' as const, papel: invite.tipo, convidadoPor: firstName(invite.criadoPorUsuario.nome), email: invite.emailDestino ?? null, grupo: null };
      }
      const base = { valido: true as const, tipo: invite.tipo === 'afiliado' ? 'afiliado' as const : 'cliente' as const, convidadoPor: firstName(invite.afiliadoOrigem?.usuario.nome ?? invite.criadoPorUsuario.nome), email: invite.emailDestino ?? null, grupo: invite.grupo?.nome ?? null };
      if (invite.tipo !== 'afiliado') return base;
      const pct = invite.comissaoPct ? Number(invite.comissaoPct).toFixed(2) : undefined;
      const doc = legalDocument('afiliado', pct);
      return { ...base, comissaoPct: pct ?? null, contrato: { texto: doc.texto, hash: doc.hash, versao: doc.versao, aprovado: doc.aprovado } };
    }
    const affiliate = await this.prisma.afiliado.findUnique({ where: { codigoAfiliado: code }, select: { statusAprovacao: true, usuario: { select: { nome: true } } } });
    if (affiliate?.statusAprovacao === 'aprovado') return { valido: true as const, tipo: 'indicacao' as const, convidadoPor: firstName(affiliate.usuario.nome), email: null, grupo: null };
    const referrer = await this.prisma.usuario.findUnique({ where: { codigoIndicacao: code.toUpperCase() }, select: { nome: true, desativadoEm: true } });
    if (referrer && !referrer.desativadoEm) return { valido: true as const, tipo: 'indicacao' as const, convidadoPor: firstName(referrer.nome), email: null, grupo: null };
    return invalid;
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    const user = await this.prisma.usuario.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      select: { id: true, email: true, papel: true, senhaHash: true, tokenVersion: true, desativadoEm: true, tentativasLogin: true, bloqueadoAte: true, totpAtivo: true, totpSecret: true, totpRecuperacao: true },
    });
    // Sempre confere uma senha (mesmo sem conta) para o tempo de resposta não revelar quem tem cadastro.
    this.dummyHash ??= argon2.hash(randomBytes(16).toString('hex'), { type: argon2.argon2id });
    const passwordOk = await argon2.verify(user?.senhaHash ?? (await this.dummyHash), dto.senha).catch(() => false);
    const lockApplies = this.shouldCountLoginFailure(user?.papel);
    const locked = Boolean(lockApplies && user?.bloqueadoAte && user.bloqueadoAte > new Date());
    if (!user || user.desativadoEm || locked || !passwordOk) {
      if (user && lockApplies && !locked) await this.registerLoginFailure(user.id);
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }
    if (user.totpAtivo) {
      const code = (dto.codigo ?? '').trim();
      if (!code) throw new UnauthorizedException({ statusCode: 401, message: 'Informe o código de 6 dígitos do seu aplicativo autenticador.', requer2fa: true });
      if (!(await this.checkSecondFactor(user, code))) {
        if (lockApplies) await this.registerLoginFailure(user.id);
        throw new UnauthorizedException({ statusCode: 401, message: 'Código inválido ou expirado.', requer2fa: true });
      }
    }
    if (user.tentativasLogin > 0 || user.bloqueadoAte) await this.prisma.usuario.update({ where: { id: user.id }, data: { tentativasLogin: 0, bloqueadoAte: null } });
    return this.issueTokens({ id: user.id, email: user.email, papel: user.papel, tokenVersion: user.tokenVersion });
  }

  // ───────── Entrar com Google ─────────

  googleClientId(): string | null { return (this.config.get<string>('GOOGLE_CLIENT_ID') ?? '').trim() || null; }

  protected verifyGoogle(credential: string): Promise<GoogleIdentity | null> {
    return verifyGoogleIdToken(credential, this.googleClientId() ?? '');
  }

  /**
   * Conta existente (cliente ou afiliado, sem 2FA) entra direto. Equipe e contas com 2FA continuam com e-mail e senha.
   * E-mail ainda sem conta: devolve um token curto para a pessoa completar CPF, telefone e aceites.
   */
  async googleLogin(credential: string, meta: { ip?: string; userAgent?: string | null } = {}): Promise<{ tokens?: { accessToken: string; refreshToken: string; user: AuthUser }; cadastro?: { token: string; nome: string; email: string } }> {
    if (!this.googleClientId()) throw new ConflictException('Entrar com Google não está ativo neste momento.');
    const identity = await this.verifyGoogle(credential);
    if (!identity) throw new UnauthorizedException('Não foi possível confirmar sua conta Google. Tente novamente ou entre com e-mail e senha.');
    const user = await this.prisma.usuario.findUnique({ where: { email: identity.email }, select: { id: true, email: true, papel: true, tokenVersion: true, desativadoEm: true, totpAtivo: true, googleSub: true, bloqueadoAte: true } });
    if (!user) {
      const token = await this.jwt.signAsync({ typ: 'google-signup', email: identity.email, nome: identity.nome, gsub: identity.sub }, { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'), expiresIn: '15m' as any });
      return { cadastro: { token, nome: identity.nome, email: identity.email } };
    }
    const passwordOnly = !GOOGLE_LOGIN_ROLES.has(user.papel) || user.totpAtivo;
    if (user.desativadoEm || passwordOnly || (user.googleSub && user.googleSub !== identity.sub)) {
      throw new UnauthorizedException(passwordOnly && !user.desativadoEm ? 'Esta conta entra com e-mail e senha.' : GENERIC_LOGIN_ERROR);
    }
    if (user.bloqueadoAte && user.bloqueadoAte > new Date()) throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    let tokenVersion = user.tokenVersion;
    if (!user.googleSub) {
      // Primeira vez com Google: vincula a conta e encerra as sessões antigas dessa conta.
      const updated = await this.prisma.usuario.update({ where: { id: user.id }, data: { googleSub: identity.sub, tokenVersion: { increment: 1 } }, select: { tokenVersion: true } });
      tokenVersion = updated.tokenVersion;
      await this.audit?.record(this.prisma, { entidade: 'usuario', entidadeId: user.id, evento: 'auth.google_vinculado', atorId: user.id, payloadDepois: { ip: meta.ip ?? null } }).catch(() => undefined);
    }
    return { tokens: await this.issueTokens({ id: user.id, email: user.email, papel: user.papel, tokenVersion }) };
  }

  /** Conclui o cadastro de quem entrou com Google: usa o mesmo caminho do cadastro normal (CPF, aceites, indicação, boas-vindas). */
  async googleSignup(dto: GoogleSignupDto, meta: { ip?: string; userAgent?: string | null } = {}): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    let payload: { typ?: string; email?: string; nome?: string; gsub?: string };
    try { payload = await this.jwt.verifyAsync(dto.token, { secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET') }); }
    catch { throw new UnauthorizedException('Sua confirmação com o Google expirou. Toque em "Entrar com Google" outra vez.'); }
    if (payload.typ !== 'google-signup' || !payload.email || !payload.gsub) throw new UnauthorizedException('Confirmação com o Google inválida.');
    const code = dto.codigoAfiliado?.trim();
    if (code) {
      const staffInvite = await this.prisma.convite.findFirst({ where: { codigo: code, tipo: { in: ['afiliado', 'operacao', 'admin'] } }, select: { id: true } });
      if (staffInvite) throw new ConflictException('Este convite exige cadastro com e-mail e senha. Use o formulário do link que você recebeu.');
    }
    // Senha aleatória forte (a pessoa entra pelo Google; se quiser senha própria, usa "Esqueci minha senha").
    const randomPassword = `Gg1${randomBytes(18).toString('hex')}`;
    const result = await this.register({ nome: (payload.nome ?? payload.email.split('@')[0]!).slice(0, 150), cpf: dto.cpf, email: payload.email, telefone: dto.telefone, maiorDeIdade: dto.maiorDeIdade, senha: randomPassword, confirmarSenha: randomPassword, aceiteTermos: dto.aceiteTermos, aceitePrivacidade: dto.aceitePrivacidade, ...(code ? { codigoAfiliado: code } : {}), ...(dto.chavePix ? { chavePix: dto.chavePix } : {}), ...(dto.endereco ? { endereco: dto.endereco } : {}) } as RegisterDto, meta);
    await this.prisma.usuario.update({ where: { id: result.user.id }, data: { googleSub: payload.gsub } });
    await this.audit?.record(this.prisma, { entidade: 'usuario', entidadeId: result.user.id, evento: 'auth.cadastro_google', atorId: result.user.id }).catch(() => undefined);
    return result;
  }

  /** Conta as falhas e bloqueia a conta (padrão: 5 erros → 15 minutos). */
  private shouldCountLoginFailure(papel?: string): boolean {
    if (papel !== 'admin') return true;
    return (this.config.get<string>('ADMIN_LOGIN_LOCK_ENABLED', 'true') ?? 'true').trim().toLowerCase() !== 'false';
  }

  private async registerLoginFailure(userId: string): Promise<void> {
    const max = Math.max(3, Number(this.config.get('LOGIN_MAX_ATTEMPTS', '5')) || 5);
    const lockMinutes = Math.max(1, Number(this.config.get('LOGIN_LOCK_MINUTES', '15')) || 15);
    const updated = await this.prisma.usuario.update({ where: { id: userId }, data: { tentativasLogin: { increment: 1 } }, select: { tentativasLogin: true } });
    if (updated.tentativasLogin >= max) {
      await this.prisma.usuario.update({ where: { id: userId }, data: { tentativasLogin: 0, bloqueadoAte: new Date(Date.now() + lockMinutes * 60_000) } });
      await this.audit?.record(this.prisma, { entidade: 'usuario', entidadeId: userId, evento: 'auth.conta_bloqueada', payloadDepois: { minutos: lockMinutes } }).catch(() => undefined);
    }
  }

  // ───────── Autenticação em dois fatores (TOTP) ─────────

  private totpKey(): string | undefined { return this.config.get<string>('TOTP_ENC_KEY') || undefined; }

  private async checkSecondFactor(user: { id: string; totpSecret: string | null; totpRecuperacao: string[] }, code: string): Promise<boolean> {
    const secret = user.totpSecret ? openSecret(user.totpSecret, this.totpKey()) : null;
    if (secret && verifyTotp(secret, code)) return true;
    const hash = hashRecoveryCode(code);
    if (user.totpRecuperacao.includes(hash)) {
      await this.prisma.usuario.update({ where: { id: user.id }, data: { totpRecuperacao: user.totpRecuperacao.filter((item) => item !== hash) } });
      await this.audit?.record(this.prisma, { entidade: 'usuario', entidadeId: user.id, evento: 'auth.2fa_codigo_recuperacao_usado', atorId: user.id }).catch(() => undefined);
      return true;
    }
    return false;
  }

  /** Passo 1: gera o segredo (ainda inativo) para o usuário cadastrar no aplicativo. */
  async startTwoFactor(userId: string): Promise<{ secret: string; otpauthUrl: string }> {
    const user = await this.prisma.usuario.findUniqueOrThrow({ where: { id: userId }, select: { email: true, totpAtivo: true } });
    if (user.totpAtivo) throw new ConflictException('A verificação em duas etapas já está ativa. Desative-a antes de configurar outra vez.');
    const secret = generateTotpSecret();
    await this.prisma.usuario.update({ where: { id: userId }, data: { totpSecret: sealSecret(secret, this.totpKey()), totpAtivo: false, totpRecuperacao: [] } });
    return { secret, otpauthUrl: otpauthUrl(secret, user.email) };
  }

  /** Passo 2: confirma com um código do aplicativo, liga o 2FA e devolve os códigos de recuperação (mostrados uma única vez). */
  async enableTwoFactor(userId: string, code: string): Promise<{ codigosRecuperacao: string[] }> {
    const user = await this.prisma.usuario.findUniqueOrThrow({ where: { id: userId }, select: { totpAtivo: true, totpSecret: true } });
    if (user.totpAtivo) throw new ConflictException('A verificação em duas etapas já está ativa.');
    const secret = user.totpSecret ? openSecret(user.totpSecret, this.totpKey()) : null;
    if (!secret) throw new ConflictException('Inicie a configuração primeiro.');
    if (!verifyTotp(secret, code)) throw new UnauthorizedException('Código inválido. Confira o horário do celular e tente de novo.');
    const codes = generateRecoveryCodes();
    await this.prisma.usuario.update({ where: { id: userId }, data: { totpAtivo: true, totpRecuperacao: codes.map(hashRecoveryCode) } });
    await this.audit?.record(this.prisma, { entidade: 'usuario', entidadeId: userId, evento: 'auth.2fa_ativado', atorId: userId }).catch(() => undefined);
    return { codigosRecuperacao: codes };
  }

  async disableTwoFactor(userId: string, password: string, code: string): Promise<{ ok: true }> {
    const user = await this.prisma.usuario.findUniqueOrThrow({ where: { id: userId }, select: { id: true, senhaHash: true, totpAtivo: true, totpSecret: true, totpRecuperacao: true } });
    if (!user.totpAtivo) return { ok: true };
    if (!(await argon2.verify(user.senhaHash, password).catch(() => false))) throw new UnauthorizedException('Senha incorreta.');
    if (!(await this.checkSecondFactor(user, code))) throw new UnauthorizedException('Código inválido ou expirado.');
    await this.prisma.usuario.update({ where: { id: userId }, data: { totpAtivo: false, totpSecret: null, totpRecuperacao: [] } });
    await this.audit?.record(this.prisma, { entidade: 'usuario', entidadeId: userId, evento: 'auth.2fa_desativado', atorId: userId }).catch(() => undefined);
    return { ok: true };
  }

  /** Perdeu o celular? Um administrador desliga o 2FA da conta (auditado) e a pessoa precisa entrar de novo. */
  async adminResetTwoFactor(targetId: string, adminId: string): Promise<{ ok: true }> {
    const target = await this.prisma.usuario.findUnique({ where: { id: targetId }, select: { id: true, email: true, papel: true } });
    if (!target) throw new ConflictException('Usuário não encontrado.');
    // Ninguém redefine o 2FA de uma conta de nível igual ou superior ao seu (só a própria conta principal mexe em administradores).
    const actor = await this.prisma.usuario.findUnique({ where: { id: adminId }, select: { id: true, email: true, papel: true } });
    if (!actor) throw new ForbiddenException('Acesso administrativo indisponível.');
    assertCanManage(actor, target);
    await this.prisma.usuario.update({ where: { id: targetId }, data: { totpAtivo: false, totpSecret: null, totpRecuperacao: [], tokenVersion: { increment: 1 } } });
    await this.audit?.record(this.prisma, { entidade: 'usuario', entidadeId: targetId, evento: 'auth.2fa_redefinido_por_admin', atorId: adminId }).catch(() => undefined);
    return { ok: true };
  }

  /** "Sair de todos os dispositivos": invalida todas as sessões (os tokens antigos deixam de renovar). */
  async revokeAllSessions(userId: string): Promise<void> {
    await this.prisma.usuario.update({ where: { id: userId }, data: { tokenVersion: { increment: 1 } } });
    await this.audit?.record(this.prisma, { entidade: 'usuario', entidadeId: userId, evento: 'auth.sessoes_revogadas', atorId: userId }).catch(() => undefined);
  }

  /** Emite novos tokens para a sessão atual (ex.: depois de trocar a senha, que encerra as outras sessões). */
  async reissue(userId: string): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    const user = await this.prisma.usuario.findUniqueOrThrow({ where: { id: userId }, select: { id: true, email: true, papel: true, tokenVersion: true, desativadoEm: true } });
    if (user.desativadoEm) throw new UnauthorizedException('Conta indisponível.');
    return this.issueTokens(user);
  }

  async profile(id: string) {
    const user = await this.prisma.usuario.findUniqueOrThrow({
      where: { id },
      select: { id: true, nome: true, email: true, telefone: true, papel: true, statusKyc: true, totpAtivo: true, criadoEm: true, afiliado: { select: { id: true, codigoAfiliado: true, statusAprovacao: true, parentAfiliadoId: true } } },
    });
    return { ...user, superadmin: isSuperAdmin(user) };
  }

  /** Minutos sem uso até pedir login de novo, para a tela avisar e encerrar a sessão no tempo certo. */
  idleMinutes(papel: string): number { return sessionIdleMinutes(papel, (key) => this.config.get<string>(key)); }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    try {
      const payload = await this.jwt.verifyAsync<AuthUser & { typ: string; tv?: number }>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      if (payload.typ !== 'refresh') throw new UnauthorizedException('Refresh token inválido.');
      const user = await this.prisma.usuario.findUnique({ where: { id: payload.id }, select: { id: true, email: true, papel: true, tokenVersion: true, desativadoEm: true } });
      if (!user || user.desativadoEm) throw new UnauthorizedException('Usuário indisponível.');
      // Sessão revogada (troca de senha, "sair de todos", mudança de papel): o refresh antigo não renova mais.
      if ((payload.tv ?? 0) !== user.tokenVersion) throw new UnauthorizedException('Sessão encerrada. Entre novamente.');
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado.');
    }
  }

  private makeCode(prefix: string): string {
    return `${prefix}-${randomBytes(6).toString('hex').toUpperCase()}`;
  }

  private async issueTokens(user: AuthUser & { tokenVersion: number }): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    const accessToken = await this.jwt.signAsync({ sub: user.id, id: user.id, email: user.email, papel: user.papel, tv: user.tokenVersion, typ: 'access' }, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m') as any,
    });
    const refreshToken = await this.jwt.signAsync({ sub: user.id, id: user.id, email: user.email, papel: user.papel, tv: user.tokenVersion, typ: 'refresh' }, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      // Renovação deslizante: cada renovação vale só pelo tempo máximo sem uso; passou disso, precisa entrar de novo.
      expiresIn: sessionIdleMinutes(user.papel, (key) => this.config.get<string>(key)) * 60,
    });
    return { accessToken, refreshToken, user: { id: user.id, email: user.email, papel: user.papel } };
  }
}
