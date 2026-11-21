import { Body, Controller, Get, Header, Param, ParseUUIDPipe, Post, Put, Query, Req, Res, StreamableFile, UseGuards } from '@nestjs/common';
import { Type } from 'class-transformer';
import { IsBoolean, IsIn, IsInt, IsNumber, IsOptional, IsString, IsUUID, Length, Matches, Max, MaxLength, Min, MinLength, ValidateNested } from 'class-validator';
import { Request, Response } from 'express';
import { AuthUser } from '../auth/auth.utils';
import { CurrentUser, Roles } from '../auth/auth.decorators';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { RolesGuard } from '../auth/roles.guard';
import { isSuperAdmin } from '../admin/superadmin';
import { CONTRACT_KINDS, type ContractKind } from './contract-templates';
import { ContractsService, type SignatureMeta } from './contracts.service';

export class DeviceDto {
  @IsOptional() @IsNumber() @Min(-90) @Max(90) latitude?: number | null;
  @IsOptional() @IsNumber() @Min(-180) @Max(180) longitude?: number | null;
  @IsOptional() @IsNumber() @Min(0) precisao?: number | null;
  @IsOptional() @IsBoolean() localNegado?: boolean;
  @IsOptional() @IsString() @MaxLength(60) fuso?: string | null;
  @IsOptional() @IsString() @MaxLength(30) idioma?: string | null;
}

export class SignContractDto {
  @IsString() @Matches(/^\s*\d{6}\s*$/, { message: 'Digite o código de 6 números.' }) codigo!: string;
  @IsOptional() @ValidateNested() @Type(() => DeviceDto) dispositivo?: DeviceDto;
}

export class CreateContractDto {
  @IsUUID() afiliadoId!: string;
  @IsIn(CONTRACT_KINDS as unknown as string[]) tipo!: ContractKind;
}

export class CancelContractDto {
  @IsString() @MinLength(3, { message: 'Escreva o motivo do cancelamento.' }) @MaxLength(300) motivo!: string;
}

export class ListContractsDto {
  @IsOptional() @IsIn(['', 'aguardando', 'assinado', 'cancelado']) status?: string;
  @IsOptional() @IsIn(['', ...CONTRACT_KINDS]) tipo?: string;
  @IsOptional() @IsString() @MaxLength(80) busca?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) page?: number;
}

export class CompanyDto {
  @IsOptional() @IsString() @MaxLength(200) razaoSocial?: string;
  @IsOptional() @IsString() @MaxLength(30) cnpj?: string;
  @IsOptional() @IsString() @MaxLength(30) nire?: string;
  @IsOptional() @IsString() @MaxLength(300) registroJunta?: string;
  @IsOptional() @IsString() @MaxLength(300) endereco?: string;
  @IsOptional() @IsString() @MaxLength(80) marca?: string;
  @IsOptional() @IsString() @MaxLength(150) representanteNome?: string;
  @IsOptional() @IsString() @MaxLength(60) representanteCargo?: string;
  @IsOptional() @IsString() @MaxLength(40) representanteNacionalidade?: string;
  @IsOptional() @IsString() @MaxLength(40) representanteEstadoCivil?: string;
  @IsOptional() @IsString() @MaxLength(60) representanteProfissao?: string;
  @IsOptional() @IsString() @MaxLength(20) representanteCpf?: string;
  @IsOptional() @IsString() @MaxLength(40) representanteRg?: string;
  @IsOptional() @IsString() @MaxLength(60) cidade?: string;
  @IsOptional() @IsString() @MaxLength(60) foro?: string;
  @IsOptional() @Type(() => Number) @IsInt() @Min(1) @Max(365) prazoAvisoDias?: number;
}

export class CompanySignDto {
  @IsString() @Matches(/^\s*\d{6}\s*$/, { message: 'Digite o código de 6 números.' }) codigo!: string;
  @IsOptional() @ValidateNested() @Type(() => DeviceDto) dispositivo?: DeviceDto;
}

class VerifyDto {
  @IsString() @Length(5, 40) numero!: string;
  @IsString() @Length(64, 64) codigo!: string;
}

export function signatureMeta(req: Request): SignatureMeta {
  const forwarded = req.get('x-forwarded-for');
  return { ip: req.ip ?? req.socket.remoteAddress ?? 'desconhecido', userAgent: req.get('user-agent')?.slice(0, 400) ?? null, forwardedFor: forwarded ? forwarded.slice(0, 200) : null };
}

/** Quem não é a conta principal não vê o e-mail nem o id de quem assinou pela empresa. */
function hideApprover<T>(value: T, user: AuthUser): T {
  if (isSuperAdmin(user) || !value || typeof value !== 'object') return value;
  const strip = (item: unknown) => (item && typeof item === 'object' ? (({ email: _email, usuarioId: _id, ...rest }) => rest)(item as Record<string, unknown>) : item);
  const out = { ...(value as Record<string, unknown>) };
  for (const key of ['aprovacao', 'aprovacaoAnterior', 'empresaAssinatura']) if (key in out) out[key] = strip(out[key]);
  return out as T;
}

function sendPdf(file: { buffer: Buffer; filename: string }, response: Response, inline: boolean): StreamableFile {
  response.setHeader('Content-Type', 'application/pdf');
  response.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${file.filename}"`);
  response.setHeader('Cache-Control', 'no-store');
  return new StreamableFile(file.buffer);
}

/** Contratos do afiliado: painel (gerar, acompanhar, cancelar, dados da empresa) e assinatura pelo próprio afiliado. */
@Controller()
export class ContractsController {
  constructor(private readonly contracts: ContractsService) {}

  // ----- Afiliado -----
  @Get('afiliados/me/contratos') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('afiliado') @Header('Cache-Control', 'private, no-store')
  mine(@CurrentUser() user: AuthUser) { return this.contracts.mine(user); }

  @Post('afiliados/me/contratos/:id/codigo') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('afiliado')
  requestCode(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Req() req: Request) { return this.contracts.requestCode(user, id, signatureMeta(req)); }

  @Post('afiliados/me/contratos/:id/assinar') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('afiliado')
  sign(@Param('id', ParseUUIDPipe) id: string, @Body() dto: SignContractDto, @CurrentUser() user: AuthUser, @Req() req: Request) { return this.contracts.sign(user, id, dto.codigo, dto.dispositivo, signatureMeta(req)); }

  @Get('afiliados/me/contratos/:id/pdf') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('afiliado')
  async ownPdf(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser, @Query('ver') view: string | undefined, @Res({ passthrough: true }) response: Response) { return sendPdf(await this.contracts.ownPdf(user, id), response, view === '1'); }

  // ----- Público: conferir autenticidade -----
  @Get('contratos/verificar') @Header('Cache-Control', 'no-store')
  verify(@Query() query: VerifyDto) { return this.contracts.verify(query.numero, query.codigo); }

  // ----- Painel -----
  @Get('admin/contratos-empresa') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  async company(@CurrentUser() user: AuthUser) { return hideApprover(await this.contracts.company(), user); }

  @Put('admin/contratos-empresa') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  async saveCompany(@Body() dto: CompanyDto, @CurrentUser() user: AuthUser) { return hideApprover(await this.contracts.saveCompany(user, dto), user); }

  @Post('admin/contratos-empresa/codigo') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  companyCode(@CurrentUser() user: AuthUser) { return this.contracts.sendCompanyCode(user); }

  @Post('admin/contratos-empresa/assinar') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  async companySign(@Body() dto: CompanySignDto, @CurrentUser() user: AuthUser, @Req() req: Request) { return hideApprover(await this.contracts.approveCompany(user, dto.codigo, dto.dispositivo, signatureMeta(req)), user); }

  @Get('admin/contratos') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  list(@Query() query: ListContractsDto) { return this.contracts.list(query); }

  @Get('admin/contratos/afiliados') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  affiliates() { return this.contracts.affiliateOptions(); }

  @Post('admin/contratos') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  create(@Body() dto: CreateContractDto, @CurrentUser() user: AuthUser) { return this.contracts.create(dto.afiliadoId, dto.tipo, { origem: 'painel', actorId: user.id, notify: true, strict: true }); }

  @Post('admin/contratos/gerar-pendentes') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  generateMissing(@CurrentUser() user: AuthUser) { return this.contracts.generateMissing(user); }

  @Get('admin/contratos/:id') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  async detail(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return hideApprover(await this.contracts.detail(id), user); }

  @Get('admin/contratos/:id/pdf') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  async pdf(@Param('id', ParseUUIDPipe) id: string, @Query('ver') view: string | undefined, @Res({ passthrough: true }) response: Response) { return sendPdf(await this.contracts.pdf(id), response, view === '1'); }

  @Post('admin/contratos/:id/cancelar') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  cancel(@Param('id', ParseUUIDPipe) id: string, @Body() dto: CancelContractDto, @CurrentUser() user: AuthUser) { return this.contracts.cancel(id, user, dto.motivo); }

  @Post('admin/contratos/:id/lembrar') @UseGuards(JwtAuthGuard, RolesGuard) @Roles('admin')
  remind(@Param('id', ParseUUIDPipe) id: string, @CurrentUser() user: AuthUser) { return this.contracts.remind(id, user); }
}
