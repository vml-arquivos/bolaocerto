import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { AuthUser } from '../auth/auth.utils';

/** Depoimentos guardados como configuração (chave `depoimento.<id>`), sem tabela nova. */
export const TESTIMONIAL_PREFIX = 'depoimento.';
export const MAX_PER_USER = 5;
export type TestimonialStatus = 'pendente' | 'aprovado' | 'oculto';
/** Aparece no site: tudo que não foi ocultado pela equipe (inclui os antigos que esperavam aprovação). */
const isVisible = (item: { status: TestimonialStatus }) => item.status !== 'oculto';
export type Testimonial = {
  id: string; usuarioId: string; nome: string; texto: string; estrelas: number;
  alvo: 'sistema' | 'afiliado'; afiliadoId: string | null; afiliadoNome: string | null;
  status: TestimonialStatus; criadoEm: string; atualizadoEm: string; moderadoPor?: string | null;
};

const clean = (value: string) => value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '').replace(/\s+\n/g, '\n').trim();
/** Nome que aparece no site: o que a pessoa escreveu, ou primeiro nome + inicial do sobrenome. */
export function publicName(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length <= 1) return parts[0] ?? 'Cotista';
  return `${parts[0]} ${parts[parts.length - 1]![0]!.toUpperCase()}.`;
}

function parse(row: { chave: string; valor: string }): Testimonial | null {
  try {
    const data = JSON.parse(row.valor) as Testimonial;
    if (!data?.id || !data.usuarioId || typeof data.texto !== 'string') return null;
    return data;
  } catch { return null; }
}

/**
 * Depoimentos dos cotistas: experiência com o Bolão Livre ou com o afiliado que vendeu. Cada um passa pela aprovação
 * da equipe antes de aparecer no site. Uma pessoa tem um depoimento por destino (o BL ou cada afiliado).
 */
@Injectable()
export class TestimonialsService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  private async all(): Promise<Testimonial[]> {
    const rows = await this.prisma.configuracaoSistema.findMany({ where: { chave: { startsWith: TESTIMONIAL_PREFIX } } });
    return rows.map(parse).filter((item): item is Testimonial => Boolean(item)).sort((a, b) => b.criadoEm.localeCompare(a.criadoEm));
  }

  private async put(item: Testimonial) {
    const chave = `${TESTIMONIAL_PREFIX}${item.id}`;
    await this.prisma.configuracaoSistema.upsert({ where: { chave }, create: { chave, valor: JSON.stringify(item) }, update: { valor: JSON.stringify(item) } });
  }

  private view(item: Testimonial) {
    return { id: item.id, nome: item.nome, texto: item.texto, estrelas: item.estrelas, alvo: item.alvo, afiliadoNome: item.afiliadoNome, criadoEm: item.criadoEm };
  }

  /**
   * Site e app: todos os depoimentos registrados aparecem (o que a equipe ocultou fica de fora).
   * `afiliado` (código) filtra os de um afiliado.
   */
  async publicList(limit = 12, affiliateCode?: string) {
    let items = (await this.all()).filter(isVisible);
    if (affiliateCode) {
      const affiliate = await this.prisma.afiliado.findUnique({ where: { codigoAfiliado: affiliateCode }, select: { id: true } });
      items = affiliate ? items.filter((item) => item.afiliadoId === affiliate.id) : [];
    }
    const total = items.length;
    const average = total ? Math.round((items.reduce((sum, item) => sum + item.estrelas, 0) / total) * 10) / 10 : 0;
    return { total, media: average, items: items.slice(0, Math.min(Math.max(limit, 1), 200)).map((item) => this.view(item)) };
  }

  /** Afiliados que a pessoa pode avaliar: quem a indicou e quem vendeu cotas para ela. */
  private async affiliatesOf(userId: string) {
    const [user, sold] = await Promise.all([
      this.prisma.usuario.findUnique({ where: { id: userId }, select: { indicadoPorAfiliadoId: true } }),
      this.prisma.cota.findMany({ where: { compradorId: userId, afiliadoReferenciaId: { not: null } }, select: { afiliadoReferenciaId: true }, distinct: ['afiliadoReferenciaId'], take: 20 }),
    ]);
    const ids = [...new Set([user?.indicadoPorAfiliadoId, ...sold.map((row) => row.afiliadoReferenciaId)].filter((id): id is string => Boolean(id)))];
    if (!ids.length) return [];
    const rows = await this.prisma.afiliado.findMany({ where: { id: { in: ids }, statusAprovacao: 'aprovado' }, select: { id: true, codigoAfiliado: true, usuario: { select: { nome: true } } } });
    return rows.map((row) => ({ id: row.id, nome: row.usuario.nome, codigo: row.codigoAfiliado }));
  }

  /** Tela do cotista: os depoimentos dele e para quem ele pode escrever. */
  async mine(user: AuthUser) {
    const [items, affiliates, profile] = await Promise.all([this.all(), this.affiliatesOf(user.id), this.prisma.usuario.findUnique({ where: { id: user.id }, select: { nome: true } })]);
    return {
      nomeSugerido: publicName(profile?.nome ?? ''),
      destinos: [{ tipo: 'sistema' as const, afiliadoId: null, nome: 'Bolão Livre' }, ...affiliates.map((item) => ({ tipo: 'afiliado' as const, afiliadoId: item.id, nome: item.nome }))],
      itens: items.filter((item) => item.usuarioId === user.id).map((item) => ({ ...this.view(item), status: item.status, afiliadoId: item.afiliadoId })),
    };
  }

  /** Escreve (ou reescreve) o depoimento para um destino. Volta para aprovação da equipe. */
  async save(user: AuthUser, input: { nome?: string; texto: string; estrelas: number; afiliadoId?: string | null }) {
    if (user.papel === 'admin' || user.papel === 'operacao') throw new ForbiddenException('Depoimento é para clientes e afiliados que compraram cotas.');
    const texto = clean(String(input.texto ?? ''));
    if (texto.length < 10) throw new BadRequestException('Conte um pouco mais da sua experiência (pelo menos 10 letras).');
    if (texto.length > 800) throw new BadRequestException('O depoimento pode ter até 800 letras.');
    const estrelas = Number(input.estrelas);
    if (!Number.isInteger(estrelas) || estrelas < 1 || estrelas > 5) throw new BadRequestException('Marque de 1 a 5 estrelas.');
    const affiliateId = input.afiliadoId || null;
    let affiliateName: string | null = null;
    if (affiliateId) {
      const allowed = await this.affiliatesOf(user.id);
      const found = allowed.find((item) => item.id === affiliateId);
      if (!found) throw new ForbiddenException('Você só pode avaliar o afiliado que te indicou ou que vendeu cotas para você.');
      affiliateName = found.nome;
    }
    const profile = await this.prisma.usuario.findUnique({ where: { id: user.id }, select: { nome: true } });
    const nome = clean(String(input.nome ?? '')).slice(0, 60) || publicName(profile?.nome ?? '');
    const items = await this.all();
    const existing = items.find((item) => item.usuarioId === user.id && item.afiliadoId === affiliateId);
    if (!existing && items.filter((item) => item.usuarioId === user.id).length >= MAX_PER_USER) throw new BadRequestException(`Você já tem ${MAX_PER_USER} depoimentos. Edite um deles.`);
    const now = new Date().toISOString();
    const item: Testimonial = {
      id: existing?.id ?? randomUUID(), usuarioId: user.id, nome, texto, estrelas,
      alvo: affiliateId ? 'afiliado' : 'sistema', afiliadoId: affiliateId, afiliadoNome: affiliateName,
      // Publica na hora; se a equipe tinha ocultado, editar não republica sozinho.
      status: existing?.status === 'oculto' ? 'oculto' : 'aprovado', criadoEm: existing?.criadoEm ?? now, atualizadoEm: now, moderadoPor: existing?.status === 'oculto' ? existing.moderadoPor ?? null : null,
    };
    await this.put(item);
    await this.audit.record(this.prisma, { entidade: 'depoimento', entidadeId: item.id, evento: existing ? 'depoimento.editado' : 'depoimento.criado', atorId: user.id, payloadDepois: { estrelas, alvo: item.alvo, afiliadoId: affiliateId } });
    return { ...this.view(item), status: item.status, afiliadoId: affiliateId };
  }

  async removeMine(user: AuthUser, id: string) {
    const item = (await this.all()).find((row) => row.id === id);
    if (!item || item.usuarioId !== user.id) throw new NotFoundException('Depoimento não encontrado.');
    await this.prisma.configuracaoSistema.deleteMany({ where: { chave: `${TESTIMONIAL_PREFIX}${id}` } });
    return { ok: true };
  }

  /** Afiliado: o que os clientes disseram dele (todos os visíveis). */
  async forAffiliate(user: AuthUser) {
    const affiliate = await this.prisma.afiliado.findUnique({ where: { usuarioId: user.id }, select: { id: true } });
    if (!affiliate) throw new NotFoundException('Afiliado não encontrado.');
    const mine = (await this.all()).filter((item) => item.afiliadoId === affiliate.id);
    const approved = mine.filter(isVisible);
    const media = approved.length ? Math.round((approved.reduce((sum, item) => sum + item.estrelas, 0) / approved.length) * 10) / 10 : 0;
    return { media, total: approved.length, aguardando: mine.filter((item) => item.status === 'pendente').length, items: approved.map((item) => this.view(item)) };
  }

  /** Equipe: todos, com filtro de situação. */
  async adminList(status?: string) {
    const items = await this.all();
    const filtered = status && ['pendente', 'aprovado', 'oculto'].includes(status) ? items.filter((item) => item.status === status) : items;
    const users = await this.prisma.usuario.findMany({ where: { id: { in: [...new Set(filtered.map((item) => item.usuarioId))] } }, select: { id: true, nome: true, email: true } });
    const byId = new Map(users.map((row) => [row.id, row]));
    return {
      contagem: { pendente: items.filter((item) => item.status === 'pendente').length, aprovado: items.filter((item) => item.status === 'aprovado').length, oculto: items.filter((item) => item.status === 'oculto').length },
      items: filtered.map((item) => ({ ...this.view(item), status: item.status, atualizadoEm: item.atualizadoEm, autor: byId.get(item.usuarioId) ? { nome: byId.get(item.usuarioId)!.nome, email: byId.get(item.usuarioId)!.email } : null })),
    };
  }

  async moderate(id: string, status: 'aprovado' | 'oculto', actor: AuthUser) {
    const item = (await this.all()).find((row) => row.id === id);
    if (!item) throw new NotFoundException('Depoimento não encontrado.');
    const next = { ...item, status, moderadoPor: actor.id, atualizadoEm: new Date().toISOString() };
    await this.put(next);
    await this.audit.record(this.prisma, { entidade: 'depoimento', entidadeId: id, evento: status === 'aprovado' ? 'depoimento.aprovado' : 'depoimento.ocultado', atorId: actor.id, payloadAntes: { status: item.status }, payloadDepois: { status } });
    return { ...this.view(next), status: next.status };
  }

  async adminRemove(id: string, actor: AuthUser) {
    const item = (await this.all()).find((row) => row.id === id);
    if (!item) throw new NotFoundException('Depoimento não encontrado.');
    await this.prisma.configuracaoSistema.deleteMany({ where: { chave: `${TESTIMONIAL_PREFIX}${id}` } });
    await this.audit.record(this.prisma, { entidade: 'depoimento', entidadeId: id, evento: 'depoimento.excluido', atorId: actor.id, payloadAntes: { status: item.status, estrelas: item.estrelas } });
    return { ok: true };
  }
}
