import { ConflictException, Injectable, UnauthorizedException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { JwtService } from '@nestjs/jwt';
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
    assertAdult(dataNascimento);
    const existing = await this.prisma.usuario.findFirst({ where: { OR: [{ cpf }, { email: dto.email.toLowerCase() }] } });
    if (existing) throw new ConflictException('CPF ou e-mail já cadastrado.');
    const affiliate = dto.codigoAfiliado
      ? await this.prisma.afiliado.findUnique({ where: { codigoAfiliado: dto.codigoAfiliado.trim() }, select: { id: true, statusAprovacao: true } })
      : null;
    if (dto.codigoAfiliado && (!affiliate || affiliate.statusAprovacao !== 'aprovado')) throw new ConflictException('Código de indicação inválido ou inativo.');
    const user = await this.prisma.usuario.create({
      data: {
        nome: dto.nome.trim(),
        cpf,
        email: dto.email.toLowerCase().trim(),
        telefone: dto.telefone,
        dataNascimento,
        senhaHash: await argon2.hash(dto.senha, { type: argon2.argon2id }),
        indicadoPorAfiliadoId: affiliate?.id,
      },
      select: { id: true, email: true, papel: true },
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
      select: { id: true, nome: true, email: true, telefone: true, papel: true, statusKyc: true, criadoEm: true },
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
