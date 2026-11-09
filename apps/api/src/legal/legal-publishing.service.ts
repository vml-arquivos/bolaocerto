import { BadRequestException, Injectable, Logger, NotFoundException, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { PrismaService } from '../common/prisma.service';
import { AuditService } from '../common/audit.service';
import { AuthUser } from '../auth/auth.utils';
import { documentSource, legalDocument, LEGAL_CATALOG, LEGAL_KINDS, LegalKind, setPublishedDocuments } from './documents';

const REFRESH_MS = 30_000;
export const MIN_DOCUMENT_LENGTH = 200;

export function assertKind(kind: string): LegalKind {
  if (!(LEGAL_KINDS as readonly string[]).includes(kind)) throw new NotFoundException('Documento não encontrado.');
  return kind as LegalKind;
}

/**
 * Textos publicados pelo painel. Ficam em memória (atualizados a cada 30 s e logo após publicar) porque o texto vigente
 * é consultado em vários pontos do sistema, inclusive em trechos síncronos.
 */
@Injectable()
export class LegalPublishingService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LegalPublishingService.name);
  private timer?: NodeJS.Timeout;
  constructor(private readonly prisma: PrismaService, private readonly audit: AuditService) {}

  async onModuleInit() {
    await this.refresh();
    this.timer = setInterval(() => void this.refresh(), REFRESH_MS);
    this.timer.unref?.();
  }
  onModuleDestroy() { if (this.timer) clearInterval(this.timer); }

  /** Recarrega os textos publicados. Se o banco falhar, mantém o que já estava em memória. */
  async refresh() {
    try {
      const rows = await this.prisma.documentoPublicado.findMany({ where: { ativo: true }, orderBy: { publicadoEm: 'asc' } });
      const next: Partial<Record<LegalKind, { texto: string; versao: string }>> = {};
      for (const row of rows) if ((LEGAL_KINDS as readonly string[]).includes(row.tipo)) next[row.tipo as LegalKind] = { texto: row.texto, versao: row.versao };
      setPublishedDocuments(next);
    } catch (error) {
      this.logger.warn(`Não foi possível carregar os documentos publicados: ${error instanceof Error ? error.message : 'erro'}`);
    }
  }

  /** Lista para o painel: texto vigente de cada documento, origem, versão e quantas pessoas já aceitaram. */
  async overview() {
    const [people, affiliates] = await Promise.all([
      this.prisma.usuario.count({ where: { papel: { in: ['cotista', 'afiliado'] }, desativadoEm: null } }),
      this.prisma.usuario.count({ where: { papel: 'afiliado', desativadoEm: null } }),
    ]);
    const items = [];
    for (const entry of LEGAL_CATALOG) {
      const doc = legalDocument(entry.tipo);
      let aceites: number | null = null;
      let base: number | null = null;
      if (entry.tipo === 'termos' || entry.tipo === 'privacidade') {
        aceites = await this.prisma.aceiteLegal.count({ where: { tipo: entry.tipo, hash: doc.hash, usuario: { desativadoEm: null, papel: { in: ['cotista', 'afiliado'] } } } });
        base = people;
      } else if (entry.tipo === 'afiliado') {
        aceites = await this.prisma.aceiteLegal.count({ where: { tipo: 'afiliado' } });
        base = affiliates;
      } else if (entry.tipo === 'participacao') {
        aceites = await this.prisma.mandato.count();
      }
      const last = await this.prisma.documentoPublicado.findFirst({ where: { tipo: entry.tipo, ativo: true }, orderBy: { publicadoEm: 'desc' }, select: { publicadoEm: true, publicadoPorId: true } });
      items.push({ ...entry, versao: doc.versao, hash: doc.hash, origem: documentSource(entry.tipo), aprovado: doc.aprovado, tamanho: doc.texto.length, publicadoEm: last?.publicadoEm ?? null, aceites, base });
    }
    return { documentos: items };
  }

  async detail(kind: LegalKind) {
    const doc = legalDocument(kind);
    const historico = await this.prisma.documentoPublicado.findMany({ where: { tipo: kind }, orderBy: { publicadoEm: 'desc' }, take: 30, select: { id: true, versao: true, hash: true, ativo: true, publicadoEm: true, publicadoPorId: true, texto: true } });
    const atores = await this.prisma.usuario.findMany({ where: { id: { in: historico.map((row) => row.publicadoPorId).filter((id): id is string => Boolean(id)) } }, select: { id: true, nome: true } });
    const nomes = new Map(atores.map((user) => [user.id, user.nome]));
    const meta = LEGAL_CATALOG.find((entry) => entry.tipo === kind)!;
    return { ...meta, ...doc, origem: documentSource(kind), historico: historico.map(({ publicadoPorId, ...row }) => ({ ...row, publicadoPor: publicadoPorId ? nomes.get(publicadoPorId) ?? null : null })) };
  }

  /** Publica um texto novo. O hash muda, então quem precisa aceitar o documento é avisado de novo. */
  async publish(kind: LegalKind, input: { texto: string; versao?: string }, actor: AuthUser) {
    const texto = input.texto.replace(/\r\n/g, '\n').trim();
    if (texto.length < MIN_DOCUMENT_LENGTH) throw new BadRequestException(`O texto precisa ter pelo menos ${MIN_DOCUMENT_LENGTH} caracteres.`);
    const hash = createHash('sha256').update(texto, 'utf8').digest('hex');
    const current = legalDocument(kind);
    if (current.texto === texto) throw new BadRequestException('Este texto é igual ao que já está publicado.');
    const today = new Date().toISOString().slice(0, 10);
    const versao = (input.versao?.trim() || `${today}.${(await this.prisma.documentoPublicado.count({ where: { tipo: kind, versao: { startsWith: today } } })) + 1}`).slice(0, 40);
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.documentoPublicado.updateMany({ where: { tipo: kind, ativo: true }, data: { ativo: false } });
      const row = await tx.documentoPublicado.create({ data: { tipo: kind, versao, texto, hash, ativo: true, publicadoPorId: actor.id } });
      await this.audit.record(tx, { entidade: 'documento', entidadeId: row.id, evento: 'documento.publicado', atorId: actor.id, payloadAntes: { versao: current.versao, hash: current.hash }, payloadDepois: { tipo: kind, versao, hash } });
      return row;
    });
    await this.refresh();
    return { tipo: kind, versao: created.versao, hash: created.hash };
  }

  /** Tira o texto publicado pelo painel e volta ao texto padrão do sistema. O histórico fica guardado. */
  async revert(kind: LegalKind, actor: AuthUser) {
    const active = await this.prisma.documentoPublicado.findFirst({ where: { tipo: kind, ativo: true }, orderBy: { publicadoEm: 'desc' } });
    if (!active) throw new BadRequestException('Este documento já está no texto padrão do sistema.');
    await this.prisma.$transaction(async (tx) => {
      await tx.documentoPublicado.updateMany({ where: { tipo: kind, ativo: true }, data: { ativo: false } });
      await this.audit.record(tx, { entidade: 'documento', entidadeId: active.id, evento: 'documento.voltou_ao_padrao', atorId: actor.id, payloadAntes: { versao: active.versao, hash: active.hash }, payloadDepois: { tipo: kind } });
    });
    await this.refresh();
    return { tipo: kind };
  }
}
