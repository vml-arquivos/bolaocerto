import { ConflictException, Injectable, Optional, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { RegisterDto, LoginDto } from './auth.dto';
import { assertAdult, AuthUser, isValidCpf, normalizeCpf } from './auth.utils';
import { generateRecoveryCodes, generateTotpSecret, hashRecoveryCode, openSecret, otpauthUrl, sealSecret, verifyTotp } from './totp';

const GENERIC_LOGIN_ERROR = 'E-mail ou senha incorretos, ou conta temporariamente bloqueada por excesso de tentativas. Tente novamente em alguns minutos.';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
    @Optional() private readonly audit?: AuditService,
  ) {}

  private dummyHash?: Promise<string>;

  async register(dto: RegisterDto): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    const cpf = normalizeCpf(dto.cpf);
    if (!isValidCpf(cpf)) throw new ConflictException('CPF inválido.');
    const dataNascimento = new Date(dto.dataNascimento);
    if (Number.isNaN(dataNascimento.getTime())) throw new ConflictException('Data de nascimento inválida.');
    assertAdult(dataNascimento);
    const email = dto.email.toLowerCase().trim();
    const existing = await this.prisma.usuario.findFirst({ where: { OR: [{ cpf }, { email }] } });
    if (existing) throw new ConflictException('CPF ou e-mail já cadastrado.');

    const code = dto.codigoAfiliado?.trim();
    const invite = code
      ? await this.prisma.convite.findFirst({ where: { codigo: code, status: 'ativo', expiraEm: { gt: new Date() } }, select: { id: true, tipo: true, afiliadoOrigemId: true, emailDestino: true } })
      : null;
    if (invite?.emailDestino && invite.emailDestino.toLowerCase() !== email) throw new ConflictException('Este convite foi direcionado a outro e-mail.');

    const directAffiliate = !invite && code
      ? await this.prisma.afiliado.findUnique({ where: { codigoAfiliado: code }, select: { id: true, statusAprovacao: true } })
      : null;
    if (code && !invite && (!directAffiliate || directAffiliate.statusAprovacao !== 'aprovado')) throw new ConflictException('Código de indicação inválido ou inativo.');
    const originAffiliateId = invite?.afiliadoOrigemId ?? directAffiliate?.id ?? null;
    const papel = invite?.tipo === 'afiliado' ? 'afiliado' : 'cotista';
    const passwordHash = await argon2.hash(dto.senha, { type: argon2.argon2id });

    const user = await this.prisma.$transaction(async (tx) => {
      const created = await tx.usuario.create({
        data: {
          nome: dto.nome.trim(),
          cpf,
          email,
          telefone: dto.telefone?.trim() || undefined,
          dataNascimento,
          senhaHash: passwordHash,
          papel,
          indicadoPorAfiliadoId: originAffiliateId ?? undefined,
        },
        select: { id: true, email: true, papel: true },
      });
      if (invite?.tipo === 'afiliado') {
        await tx.afiliado.create({
          data: {
            usuarioId: created.id,
            codigoAfiliado: this.makeCode('BL'),
            statusAprovacao: 'pendente',
            parentAfiliadoId: originAffiliateId ?? undefined,
          },
        });
      }
      if (invite) {
        const marked = await tx.convite.updateMany({ where: { id: invite.id, status: 'ativo' }, data: { status: 'usado', usadoPorUsuarioId: created.id, usadoEm: new Date() } });
        if (marked.count !== 1) throw new ConflictException('Este convite já foi utilizado.');
      }
      return created;
    });
    return this.issueTokens({ ...user, tokenVersion: 0 });
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    const user = await this.prisma.usuario.findUnique({
      where: { email: dto.email.toLowerCase().trim() },
      select: { id: true, email: true, papel: true, senhaHash: true, tokenVersion: true, desativadoEm: true, tentativasLogin: true, bloqueadoAte: true, totpAtivo: true, totpSecret: true, totpRecuperacao: true },
    });
    // Sempre confere uma senha (mesmo sem conta) para o tempo de resposta não revelar quem tem cadastro.
    this.dummyHash ??= argon2.hash(randomBytes(16).toString('hex'), { type: argon2.argon2id });
    const passwordOk = await argon2.verify(user?.senhaHash ?? (await this.dummyHash), dto.senha).catch(() => false);
    const locked = Boolean(user?.bloqueadoAte && user.bloqueadoAte > new Date());
    if (!user || user.desativadoEm || locked || !passwordOk) {
      if (user && !locked) await this.registerLoginFailure(user.id);
      throw new UnauthorizedException(GENERIC_LOGIN_ERROR);
    }
    if (user.totpAtivo) {
      const code = (dto.codigo ?? '').trim();
      if (!code) throw new UnauthorizedException({ statusCode: 401, message: 'Informe o código de 6 dígitos do seu aplicativo autenticador.', requer2fa: true });
      if (!(await this.checkSecondFactor(user, code))) {
        await this.registerLoginFailure(user.id);
        throw new UnauthorizedException({ statusCode: 401, message: 'Código inválido ou expirado.', requer2fa: true });
      }
    }
    if (user.tentativasLogin > 0 || user.bloqueadoAte) await this.prisma.usuario.update({ where: { id: user.id }, data: { tentativasLogin: 0, bloqueadoAte: null } });
    return this.issueTokens({ id: user.id, email: user.email, papel: user.papel, tokenVersion: user.tokenVersion });
  }

  /** Conta as falhas e bloqueia a conta (padrão: 5 erros → 15 minutos). */
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
    const target = await this.prisma.usuario.findUnique({ where: { id: targetId }, select: { id: true } });
    if (!target) throw new ConflictException('Usuário não encontrado.');
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
    return this.prisma.usuario.findUniqueOrThrow({
      where: { id },
      select: { id: true, nome: true, email: true, telefone: true, papel: true, statusKyc: true, totpAtivo: true, criadoEm: true, afiliado: { select: { id: true, codigoAfiliado: true, statusAprovacao: true, parentAfiliadoId: true } } },
    });
  }

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
      expiresIn: this.config.get<string>('JWT_REFRESH_TTL', '30d') as any,
    });
    return { accessToken, refreshToken, user: { id: user.id, email: user.email, papel: user.papel } };
  }
}
