import { BadGatewayException, BadRequestException, ForbiddenException, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { StatusPagamento } from '@prisma/client';
import { AuthUser } from '../auth/auth.utils';
import { endOfBrazilDay } from '../common/brazil-time';
import { PrismaService } from '../common/prisma.service';
import { SharesService } from '../shares/shares.service';
import { MODALITY_NAMES } from '../reports/pdf.util';
import { buildZip, ZipEntry } from './zip.util';

const DATE = /^\d{4}-\d{2}-\d{2}$/;
/** Máximo de arquivos por download (o restante entra no próximo período). */
export const MAX_FILES = 300;

export interface Period { de?: string; ate?: string }
export interface DownloadFile { filename: string; contentType: string; buffer: Buffer }

const brDate = (value: Date | null | undefined) => (value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric' }).format(value) : '');
const brDateTime = (value: Date | null | undefined) => (value ? new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }).format(value) : '');
const csvCell = (value: unknown) => { const text = value === null || value === undefined ? '' : String(value); return /[;"\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text; };
/** Planilha simples (separador ;, com BOM para o Excel abrir com acentos). */
export function toCsv(header: string[], rows: unknown[][]): Buffer {
  return Buffer.from(`﻿${[header, ...rows].map((row) => row.map(csvCell).join(';')).join('\r\n')}\r\n`, 'utf8');
}
const safe = (text: string) => text.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^A-Za-z0-9._-]+/g, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 60) || 'arquivo';

@Injectable()
export class DownloadsService {
  private readonly logger = new Logger(DownloadsService.name);

  constructor(private readonly prisma: PrismaService, private readonly shares: SharesService, private readonly config: ConfigService) {}

  /** Período em horário de Brasília; sem datas, os últimos 30 dias. */
  range(period: Period): { gte: Date; lte: Date; label: string } {
    for (const value of [period.de, period.ate]) if (value && !DATE.test(value)) throw new BadRequestException('Use a data no formato AAAA-MM-DD.');
    const lte = period.ate ? endOfBrazilDay(period.ate) : new Date();
    const gte = period.de ? new Date(`${period.de}T00:00:00.000-03:00`) : new Date(lte.getTime() - 30 * 86_400_000);
    if (gte > lte) throw new BadRequestException('A data inicial é depois da data final.');
    return { gte, lte, label: `${(period.de ?? gte.toISOString().slice(0, 10))}_a_${(period.ate ?? lte.toISOString().slice(0, 10))}` };
  }

  /** Recibos dos pagamentos confirmados no período (para ver na tela). */
  async listReceipts(period: Period) {
    const { gte, lte } = this.range(period);
    const payments = await this.prisma.pagamento.findMany({
      where: { status: StatusPagamento.confirmado, confirmadoEm: { gte, lte } },
      orderBy: { confirmadoEm: 'desc' },
      take: 1000,
      select: { valorBruto: true, metodo: true, confirmadoEm: true, cotaId: true, cota: { select: { comprador: { select: { nome: true, email: true } }, bolao: { select: { concurso: { select: { modalidade: true, numeroConcurso: true } } } } } } },
    });
    return payments.map((payment) => ({
      cotaId: payment.cotaId,
      numero: `BL-${payment.cotaId.slice(0, 8).toUpperCase()}`,
      participante: payment.cota.comprador.nome,
      email: payment.cota.comprador.email,
      modalidade: payment.cota.bolao.concurso ? MODALITY_NAMES[payment.cota.bolao.concurso.modalidade] ?? payment.cota.bolao.concurso.modalidade : null,
      concurso: payment.cota.bolao.concurso?.numeroConcurso ?? null,
      valor: Number(payment.valorBruto),
      metodo: payment.metodo,
      pagoEm: payment.confirmadoEm,
    }));
  }

  /** Todos os recibos do período em PDF, num .zip, com uma planilha de índice. */
  async receiptsZip(period: Period, admin: AuthUser): Promise<DownloadFile> {
    const { label } = this.range(period);
    const rows = await this.listReceipts(period);
    if (!rows.length) throw new BadRequestException('Nenhum recibo no período escolhido.');
    const entries: ZipEntry[] = [];
    const index: unknown[][] = [];
    for (const row of rows.slice(0, MAX_FILES)) {
      try {
        const file = await this.shares.getReceiptPdf(row.cotaId, admin);
        entries.push({ name: `recibos/${file.filename}`, data: file.buffer, date: row.pagoEm ?? undefined });
        index.push([row.numero, row.participante, row.email, row.modalidade, row.concurso, row.valor.toFixed(2).replace('.', ','), row.metodo, brDateTime(row.pagoEm), file.filename]);
      } catch (error) {
        this.logger.warn(`Recibo ${row.cotaId} não gerado: ${(error as Error).message}`);
        index.push([row.numero, row.participante, row.email, row.modalidade, row.concurso, row.valor.toFixed(2).replace('.', ','), row.metodo, brDateTime(row.pagoEm), 'não gerado']);
      }
    }
    entries.unshift({ name: 'recibos.csv', data: toCsv(['Recibo', 'Participante', 'E-mail', 'Modalidade', 'Concurso', 'Valor pago (R$)', 'Forma', 'Pago em', 'Arquivo'], index) });
    if (rows.length > MAX_FILES) entries.push({ name: 'LEIA-ME.txt', data: Buffer.from(`Este arquivo traz os ${MAX_FILES} recibos mais recentes do período (de ${rows.length}). Baixe um período menor para pegar o restante.\n`, 'utf8') });
    return { filename: `recibos_${label}.zip`, contentType: 'application/zip', buffer: buildZip(entries) };
  }

  /** Notas fiscais do período (emitidas e com erro), para ver na tela. */
  async listNotes(period: Period) {
    const { gte, lte } = this.range(period);
    const notes = await this.prisma.notaFiscal.findMany({
      where: { OR: [{ emitidaEm: { gte, lte } }, { emitidaEm: null, criadoEm: { gte, lte } }] },
      orderBy: { criadoEm: 'desc' },
      take: 1000,
      select: { id: true, numero: true, status: true, origem: true, valor: true, pdfUrl: true, xmlUrl: true, emitidaEm: true, criadoEm: true, pagamento: { select: { cota: { select: { comprador: { select: { nome: true, email: true } } } } } } },
    });
    return notes.map((note) => ({
      id: note.id, numero: note.numero, status: note.status, origem: note.origem, valor: Number(note.valor ?? 0),
      tomador: note.pagamento.cota.comprador.nome, email: note.pagamento.cota.comprador.email,
      pdfUrl: note.pdfUrl, xmlUrl: note.xmlUrl, emitidaEm: note.emitidaEm, criadoEm: note.criadoEm,
    }));
  }

  /** Busca um arquivo da nota (PDF/XML). Na Focus, manda o token; links de fora vão sem credencial. */
  private async fetchFile(url: string): Promise<Buffer | null> {
    if (!/^https?:\/\//.test(url)) return null;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const token = (this.config.get<string>('NFSE_FOCUS_TOKEN', '') ?? '').trim();
      const headers: Record<string, string> = {};
      if (token && /focusnfe\.com\.br/.test(new URL(url).hostname)) headers.Authorization = `Basic ${Buffer.from(`${token}:`).toString('base64')}`;
      const response = await fetch(url, { headers, signal: controller.signal, redirect: 'follow' });
      if (!response.ok) return null;
      return Buffer.from(await response.arrayBuffer());
    } catch { return null; } finally { clearTimeout(timer); }
  }

  /** Um arquivo da nota (PDF ou XML) para ver, baixar ou imprimir no próprio site, sem sair para a Focus. Cliente só a nota da própria cota. */
  async noteFile(where: { noteId?: string; cotaId?: string }, tipo: string, user: AuthUser): Promise<DownloadFile> {
    const kind = tipo === 'xml' ? 'xml' : 'pdf';
    const note = await this.prisma.notaFiscal.findFirst({
      where: where.noteId ? { id: where.noteId } : { pagamento: { cotaId: where.cotaId } },
      select: { id: true, numero: true, status: true, pdfUrl: true, xmlUrl: true, pagamento: { select: { cota: { select: { compradorId: true } } } } },
    });
    if (!note) throw new NotFoundException('Nota fiscal não encontrada.');
    const staff = ['admin', 'operacao'].includes(user.papel);
    if (!staff && note.pagamento.cota.compradorId !== user.id) throw new ForbiddenException('Esta nota não é sua.');
    if (!staff && note.status !== 'emitida') throw new NotFoundException('A nota fiscal ainda não foi emitida.');
    const url = kind === 'pdf' ? note.pdfUrl : note.xmlUrl;
    if (!url) throw new NotFoundException(kind === 'pdf' ? 'Esta nota ainda não tem PDF.' : 'Esta nota não tem XML.');
    const data = await this.fetchFile(url);
    if (!data) throw new BadGatewayException('Não foi possível buscar o arquivo da nota agora. Tente de novo em instantes.');
    return { filename: `nota-fiscal-${safe(note.numero ?? note.id.slice(0, 8))}.${kind}`, contentType: kind === 'pdf' ? 'application/pdf' : 'application/xml', buffer: data };
  }

  /** Notas emitidas do período: PDF e XML de cada uma num .zip, com planilha de índice. O que não baixar fica listado com o link. */
  async notesZip(period: Period): Promise<DownloadFile> {
    const { label } = this.range(period);
    const notes = (await this.listNotes(period)).filter((note) => note.status === 'emitida');
    if (!notes.length) throw new BadRequestException('Nenhuma nota emitida no período escolhido.');
    const entries: ZipEntry[] = [];
    const index: unknown[][] = [];
    const missing: string[] = [];
    let files = 0;
    for (const note of notes) {
      const base = `nota-${safe(note.numero ?? note.id.slice(0, 8))}_${safe(note.tomador)}`;
      const got: string[] = [];
      for (const [url, ext] of [[note.pdfUrl, 'pdf'], [note.xmlUrl, 'xml']] as const) {
        if (!url) continue;
        if (files >= MAX_FILES) { missing.push(`${base}.${ext}: limite do arquivo atingido — ${url}`); continue; }
        const data = await this.fetchFile(url);
        if (data) { entries.push({ name: `notas/${base}.${ext}`, data, date: note.emitidaEm ?? undefined }); got.push(`${base}.${ext}`); files += 1; }
        else missing.push(`${base}.${ext}: não foi possível baixar — abra pelo link: ${url}`);
      }
      index.push([note.numero ?? '', note.tomador, note.email, note.valor.toFixed(2).replace('.', ','), brDate(note.emitidaEm), note.origem, got.join(' | '), note.pdfUrl ?? '', note.xmlUrl ?? '']);
    }
    entries.unshift({ name: 'notas.csv', data: toCsv(['Número', 'Tomador', 'E-mail', 'Valor (R$)', 'Emitida em', 'Origem', 'Arquivos no zip', 'Link do PDF', 'Link do XML'], index) });
    if (missing.length) entries.push({ name: 'LEIA-ME.txt', data: Buffer.from(`Arquivos que não vieram neste zip:\n\n${missing.join('\n')}\n`, 'utf8') });
    return { filename: `notas-fiscais_${label}.zip`, contentType: 'application/zip', buffer: buildZip(entries) };
  }
}
