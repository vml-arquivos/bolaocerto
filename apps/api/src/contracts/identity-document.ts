import { BadRequestException, Injectable, Logger, NotFoundException, PayloadTooLargeException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { AuditService } from '../common/audit.service';
import { escapeHtml, MailService, wrapEmailHtml } from '../common/mail.service';
import { PrismaService } from '../common/prisma.service';
import { AuthUser } from '../auth/auth.utils';
import { StorageService } from '../attachments/storage.service';

/* Documento de identidade do afiliado (frente e verso), com o resultado da leitura automática feita no aparelho. */

export type DocSide = 'frente' | 'verso';
export const DOC_SIDES: readonly DocSide[] = ['frente', 'verso'];
export type Found = { nome: boolean | null; cpf: boolean | null; rg: boolean | null; nascimento: boolean | null };
export type DocReading = { automatica: boolean; legivel: boolean | null; motivo: string | null; largura: number | null; altura: number | null; nitidez: number | null; brilho: number | null; confianca: number | null; achou: Found };
export type DocFile = { chave: string; mime: string; ext: string; nome: string; bytes: number; enviadoEm: string; leitura: DocReading | null };
export type DocReview = { aprovado: boolean; motivo: string | null; em: string; por: string; nome: string };
export type IdentityDoc = { frente?: DocFile | null; verso?: DocFile | null; revisao?: DocReview | null };
export type DocSituation = 'pendente' | 'incompleto' | 'em_analise' | 'conferido' | 'aprovado' | 'recusado';

const TYPES: Record<string, { mime: string }> = {
  jpg: { mime: 'image/jpeg' }, png: { mime: 'image/png' }, gif: { mime: 'image/gif' }, webp: { mime: 'image/webp' }, heic: { mime: 'image/heic' },
  avif: { mime: 'image/avif' }, bmp: { mime: 'image/bmp' }, tif: { mime: 'image/tiff' }, pdf: { mime: 'application/pdf' },
};

/** Descobre o tipo pelo conteúdo do arquivo (não confia no nome nem no tipo informado pelo navegador). */
export function detectFileType(buffer: Buffer): { ext: string; mime: string } | null {
  if (!buffer || buffer.length < 12) return null;
  const hex = buffer.subarray(0, 12).toString('hex');
  const ascii = buffer.subarray(0, 12).toString('latin1');
  let ext: string | null = null;
  if (hex.startsWith('ffd8ff')) ext = 'jpg';
  else if (hex.startsWith('89504e470d0a1a0a')) ext = 'png';
  else if (ascii.startsWith('GIF87a') || ascii.startsWith('GIF89a')) ext = 'gif';
  else if (ascii.startsWith('RIFF') && ascii.slice(8, 12) === 'WEBP') ext = 'webp';
  else if (ascii.slice(4, 8) === 'ftyp') {
    const brand = ascii.slice(8, 12);
    if (['avif', 'avis'].includes(brand)) ext = 'avif';
    else if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis', 'mif1', 'msf1'].includes(brand)) ext = 'heic';
  } else if (ascii.startsWith('BM')) ext = 'bmp';
  else if (hex.startsWith('49492a00') || hex.startsWith('4d4d002a')) ext = 'tif';
  else if (buffer.subarray(0, 1024).toString('latin1').includes('%PDF-')) ext = 'pdf';
  return ext ? { ext, mime: TYPES[ext]!.mime } : null;
}

function bool(value: unknown): boolean | null {
  return typeof value === 'boolean' ? value : null;
}

function num(value: unknown, min: number, max: number): number | null {
  const n = Number(value);
  return value === null || value === undefined || value === '' || !Number.isFinite(n) ? null : Math.min(max, Math.max(min, Math.round(n * 100) / 100));
}

/** Resultado da leitura vindo do aparelho: só números e sim/não, nada de texto livre além do motivo. */
export function sanitizeReading(raw: unknown): DocReading | null {
  let value: unknown = raw;
  if (typeof raw === 'string') { try { value = JSON.parse(raw); } catch { return null; } }
  if (!value || typeof value !== 'object') return null;
  const r = value as Record<string, unknown>;
  const found = (r.achou && typeof r.achou === 'object' ? r.achou : {}) as Record<string, unknown>;
  return {
    automatica: r.automatica === true,
    legivel: bool(r.legivel),
    motivo: typeof r.motivo === 'string' ? r.motivo.replace(/[<>]/g, '').slice(0, 160) || null : null,
    largura: num(r.largura, 0, 100000), altura: num(r.altura, 0, 100000), nitidez: num(r.nitidez, 0, 1e7), brilho: num(r.brilho, 0, 255), confianca: num(r.confianca, 0, 100),
    achou: { nome: bool(found.nome), cpf: bool(found.cpf), rg: bool(found.rg), nascimento: bool(found.nascimento) },
  };
}

export function readDoc(raw: unknown): IdentityDoc {
  return raw && typeof raw === 'object' ? raw as IdentityDoc : {};
}

/** Junta o que foi encontrado na frente e no verso (o dado pode estar em qualquer um dos lados). */
export function combinedFound(doc: IdentityDoc): Found {
  const sides = [doc.frente?.leitura, doc.verso?.leitura].filter(Boolean) as DocReading[];
  const pick = (key: keyof Found) => (sides.some((s) => s.achou[key] === true) ? true : sides.some((s) => s.achou[key] === false) ? false : null);
  return { nome: pick('nome'), cpf: pick('cpf'), rg: pick('rg'), nascimento: pick('nascimento') };
}

/** Um PDF na frente pode trazer os dois lados; foto exige frente e verso. */
export function needsBack(doc: IdentityDoc): boolean {
  return !(doc.frente?.ext === 'pdf');
}

export function documentSituation(doc: IdentityDoc): DocSituation {
  if (doc.revisao) return doc.revisao.aprovado ? 'aprovado' : 'recusado';
  if (!doc.frente) return 'pendente';
  if (!doc.verso && needsBack(doc)) return 'incompleto';
  const files = [doc.frente, doc.verso].filter(Boolean) as DocFile[];
  const readable = files.every((file) => file.leitura?.legivel === true);
  const found = combinedFound(doc);
  return readable && found.nome && found.cpf && found.rg && found.nascimento ? 'conferido' : 'em_analise';
}

export const SITUATION_LABELS: Record<DocSituation, string> = {
  pendente: 'Falta enviar', incompleto: 'Falta o verso', em_analise: 'Em análise', conferido: 'Conferido automaticamente', aprovado: 'Aprovado', recusado: 'Recusado',
};

/** Visão sem a chave interna do arquivo. */
export function publicDoc(doc: IdentityDoc) {
  const file = (item: DocFile | null | undefined) => (item ? { nome: item.nome, mime: item.mime, ext: item.ext, bytes: item.bytes, enviadoEm: item.enviadoEm, leitura: item.leitura } : null);
  const situacao = documentSituation(doc);
  return { situacao, rotulo: SITUATION_LABELS[situacao], frente: file(doc.frente), verso: file(doc.verso), precisaVerso: needsBack(doc), achou: combinedFound(doc), revisao: doc.revisao ? { aprovado: doc.revisao.aprovado, motivo: doc.revisao.motivo, em: doc.revisao.em, nome: doc.revisao.nome } : null };
}

@Injectable()
export class IdentityDocumentService {
  private readonly logger = new Logger(IdentityDocumentService.name);

  constructor(private readonly prisma: PrismaService, private readonly storage: StorageService, private readonly audit: AuditService, private readonly mail: MailService) {}

  private async affiliateByUser(userId: string) {
    const affiliate = await this.prisma.afiliado.findUnique({ where: { usuarioId: userId }, select: { id: true, usuarioId: true, documentoIdentidade: true } });
    if (!affiliate) throw new NotFoundException('Somente afiliados enviam documento por aqui.');
    return affiliate;
  }

  async mine(userId: string) {
    const affiliate = await this.affiliateByUser(userId);
    return publicDoc(readDoc(affiliate.documentoIdentidade));
  }

  async upload(userId: string, side: DocSide, file: { buffer: Buffer; originalname?: string; size?: number } | undefined, rawReading: unknown) {
    if (!DOC_SIDES.includes(side)) throw new BadRequestException('Lado do documento inválido.');
    if (!file?.buffer?.length) throw new BadRequestException('Escolha a foto ou o arquivo do documento.');
    if (file.buffer.length > this.storage.maxBytes()) throw new PayloadTooLargeException(`Arquivo grande demais. O limite é de ${Math.round(this.storage.maxBytes() / 1024 / 1024)} MB.`);
    const type = detectFileType(file.buffer);
    if (!type) throw new BadRequestException('Envie uma foto (JPG, PNG, HEIC, WEBP…) ou um PDF.');
    const affiliate = await this.affiliateByUser(userId);
    const previous = readDoc(affiliate.documentoIdentidade);
    const chave = await this.storage.save(file.buffer, type.ext);
    const entry: DocFile = {
      chave, mime: type.mime, ext: type.ext, bytes: file.buffer.length, enviadoEm: new Date().toISOString(),
      nome: String(file.originalname ?? `documento-${side}.${type.ext}`).replace(/[^\p{L}\p{N}._ -]/gu, '').slice(0, 80) || `documento-${side}.${type.ext}`,
      leitura: sanitizeReading(rawReading),
    };
    // Documento novo: a conferência anterior da administração deixa de valer.
    const next: IdentityDoc = { ...previous, [side]: entry, revisao: null };
    try {
      await this.prisma.afiliado.update({ where: { id: affiliate.id }, data: { documentoIdentidade: next as unknown as Prisma.InputJsonValue } });
    } catch (error) {
      await this.storage.remove(chave);
      throw error;
    }
    const old = previous[side];
    if (old?.chave && old.chave !== chave) await this.storage.remove(old.chave);
    await this.prisma.usuario.updateMany({ where: { id: userId, statusKyc: { in: ['nao_iniciado', 'reprovado'] } }, data: { statusKyc: 'pendente' } }).catch(() => undefined);
    await this.audit.record(this.prisma, { entidade: 'afiliado', entidadeId: affiliate.id, evento: 'afiliado.documento_enviado', atorId: userId, payloadDepois: { lado: side, tipo: type.mime, bytes: entry.bytes, situacao: documentSituation(next) } });
    return publicDoc(next);
  }

  async file(afiliadoId: string, side: DocSide) {
    if (!DOC_SIDES.includes(side)) throw new BadRequestException('Lado do documento inválido.');
    const affiliate = await this.prisma.afiliado.findUnique({ where: { id: afiliadoId }, select: { documentoIdentidade: true, codigoAfiliado: true } });
    const entry = readDoc(affiliate?.documentoIdentidade)[side];
    if (!affiliate || !entry?.chave || !(await this.storage.exists(entry.chave))) throw new NotFoundException('Documento não encontrado.');
    return { stream: this.storage.open(entry.chave), mime: entry.mime, filename: `documento-${affiliate.codigoAfiliado}-${side}.${entry.ext}` };
  }

  async ownFile(userId: string, side: DocSide) {
    const affiliate = await this.affiliateByUser(userId);
    return this.file(affiliate.id, side);
  }

  async forAffiliate(afiliadoId: string | null) {
    if (!afiliadoId) return null;
    const affiliate = await this.prisma.afiliado.findUnique({ where: { id: afiliadoId }, select: { documentoIdentidade: true } });
    return affiliate ? publicDoc(readDoc(affiliate.documentoIdentidade)) : null;
  }

  async review(actor: AuthUser, afiliadoId: string, aprovado: boolean, motivo: string | null | undefined) {
    const affiliate = await this.prisma.afiliado.findUnique({ where: { id: afiliadoId }, select: { id: true, usuarioId: true, documentoIdentidade: true, usuario: { select: { nome: true, email: true } } } });
    if (!affiliate) throw new NotFoundException('Afiliado não encontrado.');
    const doc = readDoc(affiliate.documentoIdentidade);
    if (!doc.frente) throw new BadRequestException('O afiliado ainda não enviou o documento.');
    const reason = motivo?.trim().slice(0, 300) || null;
    if (!aprovado && !reason) throw new BadRequestException('Escreva o motivo para o afiliado saber o que corrigir.');
    const reviewer = await this.prisma.usuario.findUnique({ where: { id: actor.id }, select: { nome: true } });
    const next: IdentityDoc = { ...doc, revisao: { aprovado, motivo: reason, em: new Date().toISOString(), por: actor.id, nome: reviewer?.nome ?? 'Administração' } };
    await this.prisma.afiliado.update({ where: { id: affiliate.id }, data: { documentoIdentidade: next as unknown as Prisma.InputJsonValue } });
    await this.prisma.usuario.update({ where: { id: affiliate.usuarioId }, data: { statusKyc: aprovado ? 'aprovado' : 'reprovado' } }).catch(() => undefined);
    await this.audit.record(this.prisma, { entidade: 'afiliado', entidadeId: affiliate.id, evento: aprovado ? 'afiliado.documento_aprovado' : 'afiliado.documento_recusado', atorId: actor.id, payloadDepois: { motivo: reason } });
    if (!aprovado) {
      const link = `${this.mail.publicUrl()}/afiliado?aba=contrato`;
      const first = affiliate.usuario.nome.split(' ')[0] ?? affiliate.usuario.nome;
      await this.prisma.notificacao.create({ data: { usuarioId: affiliate.usuarioId, canal: 'push', tipo: 'contrato.documento', payload: { titulo: 'Envie o documento de novo', mensagem: reason ?? 'Seu documento não foi aceito.', link: '/afiliado?aba=contrato' } } }).catch(() => undefined);
      await this.mail.send({
        to: affiliate.usuario.email,
        subject: 'Envie de novo o seu documento de identidade',
        text: `Olá, ${first}. Não conseguimos aceitar o documento enviado. Motivo: ${reason}. Envie de novo em: ${link}`,
        html: wrapEmailHtml('Envie o documento de novo', `<p>Olá, ${escapeHtml(first)}.</p><p>Não conseguimos aceitar o documento de identidade enviado.</p><p><strong>Motivo:</strong> ${escapeHtml(reason ?? '')}</p>`, { label: 'Enviar de novo', url: link }),
      }).catch((error) => this.logger.warn(`Aviso de documento recusado não enviado: ${error instanceof Error ? error.message : String(error)}`));
    }
    return publicDoc(next);
  }
}
