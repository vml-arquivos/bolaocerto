import { BadRequestException, ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { MODALIDADES_LOTERIA } from '@bolaocerto/shared-types';
import { AuditService } from '../common/audit.service';
import { PrismaService } from '../common/prisma.service';
import { SaveHomeDto } from './home.dto';
import { detectFileType } from '../attachments/file-type';
import { HOME_CONFIG_KEY, HOME_IMAGE_PREFIX, HOME_IMAGE_URL, HomeConfig, MAX_IMAGE_BYTES, normalizeHomeConfig } from './home.config';
import { randomBytes } from 'crypto';

export const COMMUNITY_KEY = 'whatsapp.comunidade';
export type CommunityLinks = { comunidade: string; grupo: string; instagram: string };
/** Link do grupo do WhatsApp de cada grupo do BL ou de afiliado (quem é do grupo vê o botão). */
export const GROUP_WHATSAPP_PREFIX = 'grupo.whatsapp.';

/** Só aceita o perfil do Instagram (instagram.com). */
export function safeInstagramLink(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && ['instagram.com', 'www.instagram.com'].includes(url.hostname) && url.pathname.length > 1 ? url.toString() : '';
  } catch { return ''; }
}
/** Só aceita convites do WhatsApp (chat.whatsapp.com ou wa.me); qualquer outro endereço é descartado. */
export function safeWhatsappLink(value: unknown): string {
  if (typeof value !== 'string') return '';
  const text = value.trim();
  if (!text) return '';
  try {
    const url = new URL(text);
    return url.protocol === 'https:' && ['chat.whatsapp.com', 'wa.me', 'whatsapp.com', 'www.whatsapp.com'].includes(url.hostname) ? url.toString() : '';
  } catch { return ''; }
}

@Injectable()
export class HomeService {
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  /** Configuração pública da página inicial. Se nada foi salvo, devolve o padrão enxuto. */
  async getConfig(): Promise<HomeConfig> {
    const row = await this.prisma.configuracaoSistema.findUnique({ where: { chave: HOME_CONFIG_KEY } });
    return normalizeHomeConfig(row?.valor ?? null);
  }

  /** Links da comunidade e do grupo do WhatsApp (configurados no painel). */
  async getCommunity(): Promise<CommunityLinks> {
    const row = await this.prisma.configuracaoSistema.findUnique({ where: { chave: COMMUNITY_KEY } });
    try {
      const data = JSON.parse(row?.valor ?? '{}') as Partial<CommunityLinks>;
      return { comunidade: safeWhatsappLink(data.comunidade), grupo: safeWhatsappLink(data.grupo), instagram: safeInstagramLink(data.instagram) };
    } catch { return { comunidade: '', grupo: '', instagram: '' }; }
  }

  async saveCommunity(input: { comunidade?: string; grupo?: string; instagram?: string }, actorId: string): Promise<CommunityLinks> {
    const comunidade = (input.comunidade ?? '').trim();
    const grupo = (input.grupo ?? '').trim();
    // Instagram: sem o campo, mantém o que já estava salvo (tela antiga não apaga).
    const instagram = input.instagram === undefined ? (await this.getCommunity()).instagram : input.instagram.trim();
    if (instagram && !safeInstagramLink(instagram)) throw new BadRequestException('O link do Instagram precisa ser o perfil (começa com https://www.instagram.com/).');
    if (comunidade && !safeWhatsappLink(comunidade)) throw new BadRequestException('O link da comunidade precisa ser um convite do WhatsApp (começa com https://chat.whatsapp.com/).');
    if (grupo && !safeWhatsappLink(grupo)) throw new BadRequestException('O link do grupo precisa ser um convite do WhatsApp (começa com https://chat.whatsapp.com/).');
    const value: CommunityLinks = { comunidade: safeWhatsappLink(comunidade), grupo: safeWhatsappLink(grupo), instagram: safeInstagramLink(instagram) };
    await this.prisma.configuracaoSistema.upsert({ where: { chave: COMMUNITY_KEY }, create: { chave: COMMUNITY_KEY, valor: JSON.stringify(value) }, update: { valor: JSON.stringify(value) } });
    await this.audit.record(this.prisma, { entidade: 'configuracao', entidadeId: actorId, evento: 'whatsapp.links_alterados', atorId: actorId, payloadDepois: value as unknown as Record<string, string> });
    return value;
  }

  /** Pode mexer no link do grupo: a equipe (admin) ou o afiliado dono do grupo. */
  private async groupForEdit(groupId: string, user: { id: string; papel: string }) {
    const group = await this.prisma.grupo.findUnique({ where: { id: groupId }, select: { id: true, nome: true, afiliado: { select: { usuarioId: true } } } });
    if (!group) throw new NotFoundException('Grupo não encontrado.');
    if (user.papel !== 'admin' && group.afiliado?.usuarioId !== user.id) throw new ForbiddenException('Só o dono do grupo ou a equipe do BL muda o link do WhatsApp do grupo.');
    return group;
  }

  async getGroupWhatsapp(groupId: string, user: { id: string; papel: string }) {
    await this.groupForEdit(groupId, user);
    const row = await this.prisma.configuracaoSistema.findUnique({ where: { chave: `${GROUP_WHATSAPP_PREFIX}${groupId}` } });
    return { grupoId: groupId, link: safeWhatsappLink(row?.valor ?? '') };
  }

  async saveGroupWhatsapp(groupId: string, link: string | undefined, user: { id: string; papel: string }) {
    const group = await this.groupForEdit(groupId, user);
    const text = (link ?? '').trim();
    if (text && !safeWhatsappLink(text)) throw new BadRequestException('O link precisa ser um convite do WhatsApp (começa com https://chat.whatsapp.com/).');
    const key = `${GROUP_WHATSAPP_PREFIX}${groupId}`;
    if (!text) await this.prisma.configuracaoSistema.deleteMany({ where: { chave: key } });
    else await this.prisma.configuracaoSistema.upsert({ where: { chave: key }, create: { chave: key, valor: safeWhatsappLink(text) }, update: { valor: safeWhatsappLink(text) } });
    await this.audit.record(this.prisma, { entidade: 'grupo', entidadeId: group.id, evento: 'grupo.whatsapp_alterado', atorId: user.id, payloadDepois: { link: safeWhatsappLink(text) } });
    return { grupoId: groupId, link: safeWhatsappLink(text) };
  }

  /** Links do WhatsApp dos grupos de quem está logado (os que ele participa e, se for afiliado, os dele). */
  async myGroupsWhatsapp(userId: string) {
    const groups = await this.prisma.grupo.findMany({ where: { OR: [{ membros: { some: { usuarioId: userId } } }, { afiliado: { usuarioId: userId } }] }, select: { id: true, nome: true }, take: 20 });
    if (!groups.length) return { grupos: [] };
    const rows = await this.prisma.configuracaoSistema.findMany({ where: { chave: { in: groups.map((group) => `${GROUP_WHATSAPP_PREFIX}${group.id}`) } } });
    const links = new Map(rows.map((row) => [row.chave.slice(GROUP_WHATSAPP_PREFIX.length), safeWhatsappLink(row.valor)]));
    return { grupos: groups.map((group) => ({ grupoId: group.id, nome: group.nome, link: links.get(group.id) ?? '' })).filter((group) => group.link) };
  }

  /** Tela do painel: configuração atual e os bolões abertos que podem ser destacados. */
  async getForAdmin() {
    const [config, pools] = await Promise.all([
      this.getConfig(),
      this.prisma.bolao.findMany({ where: { status: 'aberto' }, orderBy: { criadoEm: 'desc' }, take: 100, include: { concurso: true, grupo: { select: { nome: true } } } }),
    ]);
    return {
      config,
      boloes: pools.map((pool) => ({
        id: pool.id, modalidade: pool.concurso.modalidade, grupo: pool.grupo.nome,
        concurso: pool.concurso.nomeEspecial ?? (pool.concurso.numeroConcurso > 0 ? `Concurso ${pool.concurso.numeroConcurso}` : 'Concurso a definir'),
        valorCota: Number(pool.valorCota), cotasDisponiveis: pool.cotasIlimitadas || pool.totalCotas === null ? null : Math.max(pool.totalCotas - pool.cotasVendidas, 0),
      })),
    };
  }

  async save(dto: SaveHomeDto, actorId: string): Promise<HomeConfig> {
    for (const slide of dto.slides) {
      if (slide.tipo === 'bolao' && !slide.bolaoId) throw new BadRequestException('Escolha o bolão do destaque.');
      if (slide.tipo === 'livre' && !slide.titulo.trim()) throw new BadRequestException('Todo destaque livre precisa de um título.');
      if (slide.botao?.trim() && !slide.link?.trim() && slide.tipo === 'livre') throw new BadRequestException('Destaque com botão precisa de um link.');
      if (slide.modalidade && !MODALIDADES_LOTERIA.includes(slide.modalidade as never)) throw new BadRequestException('Modalidade inválida no destaque.');
    }
    const ids = [...new Set([...dto.slides.flatMap((slide) => (slide.bolaoId ? [slide.bolaoId] : [])), ...dto.destaques])];
    if (ids.length) {
      const found = await this.prisma.bolao.count({ where: { id: { in: ids } } });
      if (found !== ids.length) throw new BadRequestException('Um dos bolões escolhidos não existe mais. Atualize a tela e escolha de novo.');
    }
    const config = normalizeHomeConfig({ slides: dto.slides, destaques: dto.destaques, secoes: dto.secoes });
    await this.prisma.$transaction(async (tx) => {
      await tx.configuracaoSistema.upsert({ where: { chave: HOME_CONFIG_KEY }, create: { chave: HOME_CONFIG_KEY, valor: JSON.stringify(config) }, update: { valor: JSON.stringify(config) } });
      await this.audit.record(tx, { entidade: 'configuracao', entidadeId: actorId, evento: 'home.atualizada', atorId: actorId, payloadDepois: { chave: HOME_CONFIG_KEY, slides: config.slides.length, destaques: config.destaques.length, secoes: { ...config.secoes } } });
    });
    await this.cleanupImages(config);
    return config;
  }

  /** Guarda a imagem do destaque (já reduzida pelo painel) na própria tabela de configurações; sem pasta nem migração. */
  async saveImage(file: { buffer: Buffer } | undefined): Promise<{ url: string }> {
    if (!file?.buffer?.length) throw new BadRequestException('Escolha uma imagem.');
    if (file.buffer.length > MAX_IMAGE_BYTES) throw new BadRequestException('Imagem muito grande. Use uma de até 1,5 MB.');
    const type = detectFileType(file.buffer);
    if (!type || type.mime === 'application/pdf') throw new BadRequestException('Use uma imagem PNG, JPG ou WEBP.');
    const key = randomBytes(9).toString('hex');
    await this.prisma.configuracaoSistema.create({ data: { chave: `${HOME_IMAGE_PREFIX}${key}`, valor: `${type.mime};${file.buffer.toString('base64')}` } });
    return { url: `${HOME_IMAGE_URL}${key}` };
  }

  async readImage(key: string): Promise<{ mime: string; data: Buffer }> {
    if (!/^[a-f0-9]{18}$/.test(key)) throw new NotFoundException();
    const row = await this.prisma.configuracaoSistema.findUnique({ where: { chave: `${HOME_IMAGE_PREFIX}${key}` } });
    const sep = row?.valor.indexOf(';') ?? -1;
    if (!row || sep < 0) throw new NotFoundException();
    return { mime: row.valor.slice(0, sep), data: Buffer.from(row.valor.slice(sep + 1), 'base64') };
  }

  /** Apaga imagens enviadas que nenhum destaque usa mais (com 1 dia de folga para quem enviou e ainda não salvou). */
  private async cleanupImages(config: HomeConfig) {
    try {
      const used = config.slides.flatMap((slide) => (slide.imagem?.startsWith(HOME_IMAGE_URL) ? [`${HOME_IMAGE_PREFIX}${slide.imagem.slice(HOME_IMAGE_URL.length)}`] : []));
      await this.prisma.configuracaoSistema.deleteMany({ where: { chave: { startsWith: HOME_IMAGE_PREFIX, notIn: used }, atualizadoEm: { lt: new Date(Date.now() - 864e5) } } });
    } catch { /* limpeza é opcional */ }
  }

  /** Últimos sorteios apurados de cada modalidade (até `porModalidade`, mais recente primeiro), com os números oficiais. */
  async latestResults(porModalidade = 5) {
    const limit = Math.min(Math.max(Math.trunc(porModalidade) || 5, 1), 30);
    const rows = await this.prisma.resultado.findMany({ orderBy: { concurso: { dataSorteio: 'desc' } }, take: 400, include: { concurso: true } });
    const groups = new Map<string, Array<{ numeroConcurso: number; dataSorteio: Date; numeros: number[]; segundoSorteio: number[]; acumulado: boolean; ganhadores: number | null; premio: number | null; festa: string | null }>>();
    for (const row of rows) {
      if (!row.numerosSorteados.length) continue;
      const list = groups.get(row.concurso.modalidade) ?? [];
      if (list.length >= limit) continue;
      const tiers = Array.isArray(row.listaRateioPremio) ? (row.listaRateioPremio as Array<Record<string, unknown>>) : [];
      const first = tiers[0] ?? {};
      const winners = Number(first.numeroDeGanhadores ?? first.ganhadores);
      const prize = Number(first.valorPremio ?? first.premio);
      list.push({
        numeroConcurso: row.concurso.numeroConcurso, dataSorteio: row.concurso.dataSorteio, numeros: row.numerosSorteados, segundoSorteio: row.numerosSegundoSorteio ?? [],
        acumulado: row.concurso.acumulado, ganhadores: Number.isFinite(winners) ? winners : null, premio: Number.isFinite(prize) && prize > 0 ? prize : null, festa: row.concurso.nomeEspecial ?? null,
      });
      groups.set(row.concurso.modalidade, list);
    }
    const order = [...MODALIDADES_LOTERIA] as string[];
    return [...groups.entries()].map(([modalidade, sorteios]) => ({ modalidade, sorteios })).sort((a, b) => order.indexOf(a.modalidade) - order.indexOf(b.modalidade));
  }
}
