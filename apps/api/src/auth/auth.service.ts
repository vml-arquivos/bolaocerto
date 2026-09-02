import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
import { randomBytes } from 'crypto';
import * as argon2 from 'argon2';
import { PrismaService } from '../common/prisma.service';
import { RegisterDto, LoginDto } from './auth.dto';
import { assertAdult, AuthUser, isValidCpf, normalizeCpf } from './auth.utils';

@Injectable()
export class AuthService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly jwt: JwtService,
    private readonly config: ConfigService,
  ) {}

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
    return this.issueTokens(user);
  }

  async login(dto: LoginDto): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    const user = await this.prisma.usuario.findUnique({ where: { email: dto.email.toLowerCase().trim() }, select: { id: true, email: true, papel: true, senhaHash: true } });
    if (!user || !(await argon2.verify(user.senhaHash, dto.senha))) throw new UnauthorizedException('Credenciais inválidas.');
    return this.issueTokens({ id: user.id, email: user.email, papel: user.papel });
  }

  async profile(id: string) {
    return this.prisma.usuario.findUniqueOrThrow({
      where: { id },
      select: { id: true, nome: true, email: true, telefone: true, papel: true, statusKyc: true, criadoEm: true, afiliado: { select: { id: true, codigoAfiliado: true, statusAprovacao: true, parentAfiliadoId: true } } },
    });
  }

  async refresh(refreshToken: string): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    try {
      const payload = await this.jwt.verifyAsync<AuthUser & { typ: string }>(refreshToken, {
        secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      });
      if (payload.typ !== 'refresh') throw new UnauthorizedException('Refresh token inválido.');
      const user = await this.prisma.usuario.findUnique({ where: { id: payload.id }, select: { id: true, email: true, papel: true } });
      if (!user) throw new UnauthorizedException('Usuário não encontrado.');
      return this.issueTokens(user);
    } catch {
      throw new UnauthorizedException('Refresh token inválido ou expirado.');
    }
  }

  private makeCode(prefix: string): string {
    return `${prefix}-${randomBytes(6).toString('hex').toUpperCase()}`;
  }

  private async issueTokens(user: AuthUser): Promise<{ accessToken: string; refreshToken: string; user: AuthUser }> {
    const accessToken = await this.jwt.signAsync({ sub: user.id, id: user.id, email: user.email, papel: user.papel, typ: 'access' }, {
      secret: this.config.getOrThrow<string>('JWT_ACCESS_SECRET'),
      expiresIn: this.config.get<string>('JWT_ACCESS_TTL', '15m') as any,
    });
    const refreshToken = await this.jwt.signAsync({ sub: user.id, id: user.id, email: user.email, papel: user.papel, typ: 'refresh' }, {
      secret: this.config.getOrThrow<string>('JWT_REFRESH_SECRET'),
      expiresIn: this.config.get<string>('JWT_REFRESH_TTL', '30d') as any,
    });
    return { accessToken, refreshToken, user };
  }
}
