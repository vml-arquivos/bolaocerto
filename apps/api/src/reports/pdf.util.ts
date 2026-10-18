import PDFDocument from 'pdfkit';
import { Column, formatDateBr, Row } from './export.util';

/** Paleta e helpers compartilhados pelos relatórios e pelo recibo em PDF. */
export const PDF_COLORS = {
  brand: '#1F3A5F',
  brandSoft: '#E8EEF6',
  accent: '#1A9D5A',
  text: '#1B2430',
  muted: '#5B6675',
  line: '#D5DBE3',
  zebra: '#F6F8FB',
  warn: '#B26B00',
  danger: '#B3261E',
};

export const PLATFORM_NAME = 'BL — Bolão Livre';

export const MODALITY_NAMES: Record<string, string> = {
  megasena: 'Mega-Sena', lotofacil: 'Lotofácil', quina: 'Quina', lotomania: 'Lotomania', duplasena: 'Dupla Sena',
  timemania: 'Timemania', diadesorte: 'Dia de Sorte', supersete: 'Super Sete', loteca: 'Loteca',
};

/** Helvetica (WinAnsi) não tem todos os glifos; troca o que não existe para não gerar "lixo". */
export function pdfText(value: unknown): string {
  if (value === null || value === undefined) return '';
  return String(value)
    .replace(/[→⇒]/g, '->')
    .replace(/[✓✔]/g, 'OK')
    .replace(/[‘’]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/ /g, ' ')
    .replace(/[^\u0009\u000A -ÿ–—•€]/g, '?');
}

export function brl(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === '') return '';
  const n = Number(value);
  if (!Number.isFinite(n)) return '';
  return `R$ ${n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export function formatCell(value: Row[string], type: Column['type']): string {
  if (value === null || value === undefined || value === '') return '';
  if (value instanceof Date) return formatDateBr(value);
  if (typeof value === 'number') return type === 'money' ? brl(value) : type === 'int' ? String(Math.trunc(value)) : value.toLocaleString('pt-BR');
  if (typeof value === 'boolean') return value ? 'Sim' : 'Não';
  return pdfText(value);
}

export interface PdfKpi { label: string; value: string; hint?: string }
export interface PdfSection { title: string; description?: string; columns: Column[]; rows: Row[]; kpis?: PdfKpi[]; emptyText?: string; totals?: boolean }
export interface PdfReport { title: string; subtitle?: string; filters?: string[]; kpis?: PdfKpi[]; sections: PdfSection[]; generatedBy?: string; footerNote?: string }

const MARGIN = 32;
const FOOTER_H = 26;

export function collect(doc: PDFKit.PDFDocument): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    doc.on('data', (chunk: Buffer) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
  });
}

/** Escreve sem permitir que o PDFKit crie uma página nova (rodapé/cabeçalho). */
export function textInMargin(doc: PDFKit.PDFDocument, text: string, x: number, y: number, options: PDFKit.Mixins.TextOptions): void {
  const bottom = doc.page.margins.bottom;
  doc.page.margins.bottom = 0;
  doc.text(text, x, y, { lineBreak: false, ...options });
  doc.page.margins.bottom = bottom;
}

function drawPageHeader(doc: PDFKit.PDFDocument, report: PdfReport): void {
  const width = doc.page.width;
  doc.save().rect(0, 0, width, 30).fill(PDF_COLORS.brand).restore();
  doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(11);
  textInMargin(doc, PLATFORM_NAME, MARGIN, 10, { width: 260 });
  doc.font('Helvetica').fontSize(9);
  textInMargin(doc, pdfText(report.title), width - MARGIN - 420, 11, { width: 420, align: 'right', ellipsis: true });
  doc.fillColor(PDF_COLORS.text);
}

function drawKpis(doc: PDFKit.PDFDocument, kpis: PdfKpi[], y: number): number {
  const usable = doc.page.width - MARGIN * 2;
  const perRow = Math.min(kpis.length, 5);
  const gap = 8;
  const boxW = (usable - gap * (perRow - 1)) / perRow;
  const boxH = 44;
  let cursorY = y;
  kpis.forEach((kpi, index) => {
    const col = index % perRow;
    if (index > 0 && col === 0) cursorY += boxH + gap;
    const x = MARGIN + col * (boxW + gap);
    doc.save().roundedRect(x, cursorY, boxW, boxH, 4).fillAndStroke(PDF_COLORS.brandSoft, PDF_COLORS.line).restore();
    doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(7.5);
    textInMargin(doc, pdfText(kpi.label).toUpperCase(), x + 8, cursorY + 7, { width: boxW - 16, ellipsis: true });
    doc.fillColor(PDF_COLORS.brand).font('Helvetica-Bold').fontSize(13);
    textInMargin(doc, pdfText(kpi.value), x + 8, cursorY + 19, { width: boxW - 16, ellipsis: true });
    if (kpi.hint) {
      doc.fillColor(PDF_COLORS.muted).font('Helvetica').fontSize(7);
      textInMargin(doc, pdfText(kpi.hint), x + 8, cursorY + 35, { width: boxW - 16, ellipsis: true });
    }
  });
  doc.fillColor(PDF_COLORS.text);
  return cursorY + boxH + 12;
}

function columnWidths(columns: Column[], usable: number): number[] {
  const weights = columns.map((column) => {
    const longestWord = Math.max(...column.header.split(/\s+/).map((word) => word.length), 4);
    const floor = Math.max(longestWord * 1.5 + 3, column.type === 'date' ? 21 : column.type === 'money' ? 16 : column.type === 'int' ? 8 : 9);
    return Math.max(column.width ?? (column.type === 'money' ? 14 : column.type === 'date' ? 16 : column.type === 'int' ? 9 : 18), floor);
  });
  const total = weights.reduce((sum, weight) => sum + weight, 0);
  return weights.map((weight) => (weight / total) * usable);
}

function drawTable(doc: PDFKit.PDFDocument, report: PdfReport, section: PdfSection, startY: number): number {
  const usable = doc.page.width - MARGIN * 2;
  const widths = columnWidths(section.columns, usable);
  const rowH = 17;
  doc.font('Helvetica-Bold').fontSize(7.5);
  const twoLines = section.columns.some((column, i) => doc.widthOfString(pdfText(column.header)) > widths[i]! - 8);
  const headH = twoLines ? 24 : 18;
  const limit = () => doc.page.height - FOOTER_H - 8;
  let y = startY;

  const drawHead = () => {
    doc.save().rect(MARGIN, y, usable, headH).fill(PDF_COLORS.brand).restore();
    let x = MARGIN;
    doc.fillColor('#FFFFFF').font('Helvetica-Bold').fontSize(7.5);
    section.columns.forEach((column, i) => {
      textInMargin(doc, pdfText(column.header), x + 4, y + (twoLines ? 4 : 5), { width: widths[i]! - 8, height: headH - 6, ellipsis: true, align: column.type === 'money' || column.type === 'int' ? 'right' : 'left', lineBreak: true });
      x += widths[i]!;
    });
    y += headH;
    doc.fillColor(PDF_COLORS.text);
  };

  drawHead();
  if (section.rows.length === 0) {
    doc.font('Helvetica-Oblique').fontSize(9).fillColor(PDF_COLORS.muted);
    textInMargin(doc, section.emptyText ?? 'Nenhum registro para os filtros selecionados.', MARGIN + 6, y + 8, { width: usable - 12 });
    doc.fillColor(PDF_COLORS.text);
    return y + 30;
  }

  const sums = section.columns.map(() => 0);
  section.rows.forEach((row, rowIndex) => {
    if (y + rowH > limit()) {
      doc.addPage();
      drawPageHeader(doc, report);
      y = 44;
      drawHead();
    }
    if (rowIndex % 2 === 1) doc.save().rect(MARGIN, y, usable, rowH).fill(PDF_COLORS.zebra).restore();
    let x = MARGIN;
    doc.font('Helvetica').fontSize(7.5).fillColor(PDF_COLORS.text);
    section.columns.forEach((column, i) => {
      const value = row[column.key];
      if (column.sum && typeof value === 'number') sums[i] = (sums[i] ?? 0) + value;
      const shown = column.key === 'modalidade' && typeof value === 'string' ? (MODALITY_NAMES[value] ?? value) : value;
      textInMargin(doc, formatCell(shown, column.type), x + 4, y + 5, { width: widths[i]! - 8, height: rowH - 4, ellipsis: true, align: column.type === 'money' || column.type === 'int' ? 'right' : 'left', lineBreak: true });
      x += widths[i]!;
    });
    doc.save().moveTo(MARGIN, y + rowH).lineTo(MARGIN + usable, y + rowH).lineWidth(0.3).stroke(PDF_COLORS.line).restore();
    y += rowH;
  });

  if (section.totals !== false && section.columns.some((column) => column.sum)) {
    if (y + rowH + 4 > limit()) { doc.addPage(); drawPageHeader(doc, report); y = 44; }
    doc.save().rect(MARGIN, y, usable, rowH + 3).fill(PDF_COLORS.brandSoft).restore();
    let x = MARGIN;
    doc.font('Helvetica-Bold').fontSize(8).fillColor(PDF_COLORS.brand);
    section.columns.forEach((column, i) => {
      const label = i === 0 ? `TOTAL (${section.rows.length})` : column.sum ? formatCell(sums[i], column.type) : '';
      textInMargin(doc, label, x + 4, y + 5, { width: widths[i]! - 8, ellipsis: true, align: column.sum ? 'right' : 'left' });
      x += widths[i]!;
    });
    doc.fillColor(PDF_COLORS.text);
    y += rowH + 3;
  }
  return y + 6;
}

/** Relatório tabular em A4 paisagem: cabeçalho, indicadores, tabelas com totais e rodapé numerado. */
export async function buildPdfReport(report: PdfReport): Promise<Buffer> {
  const doc = new PDFDocument({ size: 'A4', layout: 'landscape', margin: MARGIN, bufferPages: true, info: { Title: pdfText(report.title), Author: PLATFORM_NAME, Creator: PLATFORM_NAME, Subject: pdfText(report.subtitle ?? report.title) } });
  const done = collect(doc);
  drawPageHeader(doc, report);
  let y = 44;
  doc.font('Helvetica-Bold').fontSize(18).fillColor(PDF_COLORS.brand);
  textInMargin(doc, pdfText(report.title), MARGIN, y, { width: doc.page.width - MARGIN * 2 });
  y += 25;
  if (report.subtitle) {
    doc.font('Helvetica').fontSize(10).fillColor(PDF_COLORS.muted);
    textInMargin(doc, pdfText(report.subtitle), MARGIN, y, { width: doc.page.width - MARGIN * 2 });
    y += 15;
  }
  doc.font('Helvetica').fontSize(8).fillColor(PDF_COLORS.muted);
  const meta = [`Gerado em ${formatDateBr(new Date())}`, report.generatedBy ? `por ${report.generatedBy}` : null, ...(report.filters?.length ? [`Filtros: ${report.filters.join(' · ')}`] : ['Filtros: nenhum (todos os registros)'])].filter(Boolean).join('  |  ');
  textInMargin(doc, pdfText(meta), MARGIN, y, { width: doc.page.width - MARGIN * 2, ellipsis: true });
  y += 18;
  if (report.kpis?.length) y = drawKpis(doc, report.kpis, y);

  for (const section of report.sections) {
    if (y + 80 > doc.page.height - FOOTER_H) { doc.addPage(); drawPageHeader(doc, report); y = 44; }
    doc.font('Helvetica-Bold').fontSize(11).fillColor(PDF_COLORS.brand);
    textInMargin(doc, pdfText(section.title), MARGIN, y, { width: doc.page.width - MARGIN * 2 });
    y += 16;
    if (section.description) {
      doc.font('Helvetica').fontSize(8).fillColor(PDF_COLORS.muted);
      textInMargin(doc, pdfText(section.description), MARGIN, y, { width: doc.page.width - MARGIN * 2, ellipsis: true });
      y += 13;
    }
    if (section.kpis?.length) y = drawKpis(doc, section.kpis, y);
    y = drawTable(doc, report, section, y);
  }

  const range = doc.bufferedPageRange();
  for (let i = range.start; i < range.start + range.count; i += 1) {
    doc.switchToPage(i);
    const y2 = doc.page.height - FOOTER_H + 6;
    doc.save().moveTo(MARGIN, y2 - 4).lineTo(doc.page.width - MARGIN, y2 - 4).lineWidth(0.4).stroke(PDF_COLORS.line).restore();
    doc.font('Helvetica').fontSize(7.5).fillColor(PDF_COLORS.muted);
    textInMargin(doc, pdfText(report.footerNote ?? 'Documento gerado automaticamente pela plataforma. Dados confidenciais: uso restrito à administração.'), MARGIN, y2, { width: doc.page.width - MARGIN * 2 - 90 });
    textInMargin(doc, `Página ${i + 1} de ${range.count}`, doc.page.width - MARGIN - 90, y2, { width: 90, align: 'right' });
  }
  doc.end();
  return done;
}
