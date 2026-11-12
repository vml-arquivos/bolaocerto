import { BadRequestException, ConflictException, Injectable, NotFoundException } from '@nestjs/common';
import { randomBytes, randomUUID } from 'node:crypto';
import { detectFileType } from '../attachments/file-type';
import { PrismaService } from '../common/prisma.service';
import { SaveBlogPostDto, SaveSiteSeoDto } from './blog.dto';

/** Posts e imagens do blog ficam na tabela de configurações (como a página inicial): sem pasta nem migração. */
export const BLOG_POST_PREFIX = 'blog.post.';
export const BLOG_IMAGE_PREFIX = 'blog.img.';
export const BLOG_IMAGE_URL = '/api/v1/blog/imagem/';
export const SITE_SEO_KEY = 'site.seo';
export const MAX_BLOG_IMAGE_BYTES = 1_500_000;

export interface BlogPost {
  id: string; slug: string; titulo: string; resumo: string; conteudo: string;
  imagem: string | null; imagemAlt: string | null; seoTitulo: string | null; seoDescricao: string | null; palavrasChave: string | null; categoria: string | null;
  status: 'rascunho' | 'publicado'; publicadoEm: string | null; criadoEm: string; atualizadoEm: string; autor: string | null;
}
export interface SiteSeo { titulo: string; descricao: string; palavrasChave: string | null; imagem: string | null }

export const DEFAULT_SITE_SEO: SiteSeo = {
  titulo: 'Bolão Livre — bolões de concursos oficiais',
  descricao: 'Participe de bolões da Mega-Sena, Lotofácil, Quina e outras modalidades com cotas rastreáveis, resultado oficial e comprovantes na sua conta.',
  palavrasChave: 'bolão, bolão online, mega-sena, lotofácil, quina, cotas de bolão, resultados da loteria',
  imagem: null,
};

/** Endereço amigável a partir do título: sem acento, minúsculo, com hífen. */
export function slugify(text: string): string {
  return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 80).replace(/-+$/, '') || 'post';
}

/** Resumo automático: o começo do texto, sem marcações, cortado numa palavra. */
export function excerpt(markdown: string, size = 180): string {
  const plain = markdown.replace(/^#{1,6}\s.*$/gm, '').replace(/!\[[^\]]*\]\([^)]*\)/g, '').replace(/\[([^\]]+)\]\([^)]*\)/g, '$1').replace(/[#>*_`-]+/g, ' ').replace(/\s+/g, ' ').trim();
  if (plain.length <= size) return plain;
  return `${plain.slice(0, size).replace(/\s+\S*$/, '')}…`;
}

@Injectable()
export class BlogService {
  constructor(private readonly prisma: PrismaService) {}

  private async all(): Promise<BlogPost[]> {
    const rows = await this.prisma.configuracaoSistema.findMany({ where: { chave: { startsWith: BLOG_POST_PREFIX } } });
    const posts: BlogPost[] = [];
    for (const row of rows) { try { posts.push(JSON.parse(row.valor) as BlogPost); } catch { /* registro inválido fica de fora */ } }
    return posts.sort((a, b) => (b.publicadoEm ?? b.criadoEm).localeCompare(a.publicadoEm ?? a.criadoEm));
  }

  /** Lista pública: só publicados, sem o texto completo. */
  async listPublished(limit = 50) {
    const posts = (await this.all()).filter((post) => post.status === 'publicado');
    return posts.slice(0, Math.min(Math.max(limit, 1), 100)).map(({ conteudo: _conteudo, ...post }) => post);
  }

  async getPublished(slug: string): Promise<BlogPost> {
    const post = (await this.all()).find((item) => item.slug === slug && item.status === 'publicado');
    if (!post) throw new NotFoundException('Post não encontrado.');
    return post;
  }

  listForAdmin() { return this.all(); }

  async save(dto: SaveBlogPostDto, author: { id: string; nome?: string | null }, id?: string): Promise<BlogPost> {
    const posts = await this.all();
    const current = id ? posts.find((post) => post.id === id) : undefined;
    if (id && !current) throw new NotFoundException('Post não encontrado.');
    const slug = dto.slug?.trim() || current?.slug || slugify(dto.titulo);
    if (posts.some((post) => post.slug === slug && post.id !== current?.id)) throw new ConflictException('Já existe um post com esse endereço. Mude o endereço (slug) ou o título.');
    const now = new Date().toISOString();
    const clean = (value?: string | null) => (value?.trim() ? value.trim() : null);
    const post: BlogPost = {
      id: current?.id ?? randomUUID(), slug, titulo: dto.titulo.trim(), resumo: clean(dto.resumo) ?? excerpt(dto.conteudo), conteudo: dto.conteudo,
      imagem: clean(dto.imagem), imagemAlt: clean(dto.imagemAlt), seoTitulo: clean(dto.seoTitulo), seoDescricao: clean(dto.seoDescricao), palavrasChave: clean(dto.palavrasChave), categoria: clean(dto.categoria),
      status: dto.status, publicadoEm: dto.status === 'publicado' ? current?.publicadoEm ?? now : null,
      criadoEm: current?.criadoEm ?? now, atualizadoEm: now, autor: current?.autor ?? author.nome ?? null,
    };
    await this.prisma.configuracaoSistema.upsert({ where: { chave: `${BLOG_POST_PREFIX}${post.id}` }, create: { chave: `${BLOG_POST_PREFIX}${post.id}`, valor: JSON.stringify(post) }, update: { valor: JSON.stringify(post) } });
    await this.cleanupImages();
    return post;
  }

  async remove(id: string) {
    await this.prisma.configuracaoSistema.deleteMany({ where: { chave: `${BLOG_POST_PREFIX}${id}` } });
    await this.cleanupImages();
    return { ok: true };
  }

  async saveImage(file: { buffer: Buffer } | undefined): Promise<{ url: string }> {
    if (!file?.buffer?.length) throw new BadRequestException('Escolha uma imagem.');
    if (file.buffer.length > MAX_BLOG_IMAGE_BYTES) throw new BadRequestException('Imagem muito grande. Use uma de até 1,5 MB.');
    const type = detectFileType(file.buffer);
    if (!type || type.mime === 'application/pdf') throw new BadRequestException('Use uma imagem PNG, JPG ou WEBP.');
    const key = randomBytes(9).toString('hex');
    await this.prisma.configuracaoSistema.create({ data: { chave: `${BLOG_IMAGE_PREFIX}${key}`, valor: `${type.mime};${file.buffer.toString('base64')}` } });
    return { url: `${BLOG_IMAGE_URL}${key}` };
  }

  async readImage(key: string): Promise<{ mime: string; data: Buffer }> {
    if (!/^[a-f0-9]{18}$/.test(key)) throw new NotFoundException();
    const row = await this.prisma.configuracaoSistema.findUnique({ where: { chave: `${BLOG_IMAGE_PREFIX}${key}` } });
    const sep = row?.valor.indexOf(';') ?? -1;
    if (!row || sep < 0) throw new NotFoundException();
    return { mime: row.valor.slice(0, sep), data: Buffer.from(row.valor.slice(sep + 1), 'base64') };
  }

  /** Apaga imagens que nenhum post (capa, texto) nem o SEO usa mais, com 1 dia de folga para quem enviou e ainda não salvou. */
  private async cleanupImages() {
    try {
      const posts = await this.all();
      const seo = await this.getSeo();
      const text = JSON.stringify([posts, seo]);
      const keys = [...text.matchAll(/\/api\/v1\/blog\/imagem\/([a-f0-9]{18})/g)].map((match) => `${BLOG_IMAGE_PREFIX}${match[1]}`);
      await this.prisma.configuracaoSistema.deleteMany({ where: { chave: { startsWith: BLOG_IMAGE_PREFIX, notIn: keys }, atualizadoEm: { lt: new Date(Date.now() - 864e5) } } });
    } catch { /* limpeza é opcional */ }
  }

  async getSeo(): Promise<SiteSeo> {
    const row = await this.prisma.configuracaoSistema.findUnique({ where: { chave: SITE_SEO_KEY } }).catch(() => null);
    if (!row) return DEFAULT_SITE_SEO;
    try { return { ...DEFAULT_SITE_SEO, ...(JSON.parse(row.valor) as Partial<SiteSeo>) }; } catch { return DEFAULT_SITE_SEO; }
  }

  async saveSeo(dto: SaveSiteSeoDto): Promise<SiteSeo> {
    const seo: SiteSeo = { titulo: dto.titulo.trim(), descricao: dto.descricao.trim(), palavrasChave: dto.palavrasChave?.trim() || null, imagem: dto.imagem?.trim() || null };
    await this.prisma.configuracaoSistema.upsert({ where: { chave: SITE_SEO_KEY }, create: { chave: SITE_SEO_KEY, valor: JSON.stringify(seo) }, update: { valor: JSON.stringify(seo) } });
    await this.cleanupImages();
    return seo;
  }
}
