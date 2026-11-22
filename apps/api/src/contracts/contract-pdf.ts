import PDFDocument from 'pdfkit';
import { collect, PDF_COLORS, pdfText, textInMargin } from '../reports/pdf.util';
import { BL_LOGO_PNG, SORTE_TECH_LOGO_PNG } from './contract-brand';

/** Dados da empresa para o papel timbrado (rodapé). */
export type Letterhead = { razaoSocial: string; cnpj: string; endereco?: string | null; site?: string | null };

const LETTERHEAD_BLUE = '#2563EB';
const MARGIN_X = 60;
const HEADER_TOP = 30;
const BODY_TOP = 104;
const BODY_BOTTOM = 92;

/** Linha do certificado de assinatura (rótulo + valor). */
export type CertificateRow = readonly [label: string, value: string];
export type CertificateBlock = { title: string; rows: CertificateRow[] };

export type ContractPdfInput = {
  numero: string;
  titulo: string;
  texto: string;
  hash: string;
  status: string;
  blocks: CertificateBlock[];
  verifyUrl: string | null;
  footer: string;
  /** Papel timbrado: Bolão Livre em destaque, SORTE TECH como empresa, endereço e CNPJ no rodapé. */
  letterhead?: Letterhead | null;
  /** Faixa "MODELO" em todas as páginas (prévia sem valor). */
  watermark?: string | null;
};

/** Cabeçalho e rodapé do papel timbrado em uma página já desenhada. */
function drawLetterhead(doc: PDFKit.PDFDocument, letterhead: Letterhead, footerLine: string) {
  const width = doc.page.width - MARGIN_X * 2;
  // Bolão Livre (produto) à esquerda, maior; SORTE TECH (empresa) à direita.
  doc.image(BL_LOGO_PNG, MARGIN_X, HEADER_TOP + 4, { height: 34 });
  const stHeight = 26;
  const stWidth = (720 / 217) * stHeight;
  doc.font('Helvetica').fontSize(6.5).fillColor(PDF_COLORS.muted);
  textInMargin(doc, 'UMA PLATAFORMA', doc.page.width - MARGIN_X - stWidth, HEADER_TOP, { width: stWidth, align: 'right', lineBreak: false });
  doc.image(SORTE_TECH_LOGO_PNG, doc.page.width - MARGIN_X - stWidth, HEADER_TOP + 10, { height: stHeight });
  doc.save().moveTo(MARGIN_X, HEADER_TOP + 50).lineTo(MARGIN_X + width, HEADER_TOP + 50).lineWidth(1.2).strokeColor(LETTERHEAD_BLUE).stroke().restore();

  const bottom = doc.page.height - 66;
  doc.save().moveTo(MARGIN_X, bottom).lineTo(MARGIN_X + width, bottom).lineWidth(0.6).strokeColor('#C7D2FE').stroke().restore();
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0F172A');
  textInMargin(doc, pdfText(`${letterhead.razaoSocial} · CNPJ ${letterhead.cnpj}`), MARGIN_X, bottom + 7, { width, align: 'center', lineBreak: false });
  doc.font('Helvetica').fontSize(7).fillColor(PDF_COLORS.muted);
  if (letterhead.endereco) textInMargin(doc, pdfText(`${letterhead.endereco}${letterhead.site ? ` · ${letterhead.site}` : ''}`), MARGIN_X, bottom + 18, { width, align: 'center', lineBreak: false });
  doc.font('Helvetica').fontSize(6.8).fillColor(PDF_COLORS.muted);
  textInMargin(doc, pdfText(footerLine), MARGIN_X, bottom + 30, { width, align: 'center', lineBreak: false });
}

function drawWatermark(doc: PDFKit.PDFDocument, text: string) {
  doc.save();
  doc.rotate(-35, { origin: [doc.page.width / 2, doc.page.height / 2] });
  doc.font('Helvetica-Bold').fontSize(64).fillColor('#2563EB').fillOpacity(0.08);
  textInMargin(doc, pdfText(text), 0, doc.page.height / 2 - 40, { width: doc.page.width, align: 'center', lineBreak: false });
  doc.restore();
}

const HEADING = /^(\d+\.\s+[A-ZÁÉÍÓÚÂÊÔÃÕÇ]|CLÁUSULA\s|CONTRATANTE:|CONTRATADO:|AFILIADO:)/;
const isAllCaps = (line: string) => line.length > 3 && line === line.toUpperCase() && /[A-ZÁÉÍÓÚÂÊÔÃÕÇ]/.test(line);

/** Gera o PDF do contrato: texto integral, rodapé com número e hash em todas as páginas e o certificado de assinatura. */
export async function buildContractPdf(input: ContractPdfInput): Promise<Buffer> {
  const branded = Boolean(input.letterhead);
  const doc = new PDFDocument({ size: 'A4', margins: branded ? { top: BODY_TOP, bottom: BODY_BOTTOM, left: MARGIN_X, right: MARGIN_X } : { top: 56, bottom: 64, left: 60, right: 60 }, bufferPages: true, info: { Title: `${input.titulo} — ${input.numero}`, Author: 'BL — Bolão Livre', Creator: 'BL — Bolão Livre', Subject: input.titulo } });
  const done = collect(doc);
  const width = doc.page.width - 120;

  const lines = input.texto.split('\n');
  let first = true;
  for (const raw of lines) {
    const line = pdfText(raw.trimEnd());
    if (!line.trim()) { doc.moveDown(0.45); continue; }
    if (first) {
      doc.font('Helvetica-Bold').fontSize(14).fillColor(PDF_COLORS.brand).text(line, { align: 'center', width });
      first = false;
      continue;
    }
    if (/^(Contrato nº|Termo Aditivo nº)/.test(line)) { doc.font('Helvetica').fontSize(10).fillColor(PDF_COLORS.muted).text(line, { align: 'center', width }); continue; }
    if (isAllCaps(line) && !/^(CONTRATANTE|CONTRATADO|AFILIADO):/.test(line)) {
      doc.moveDown(0.2).font('Helvetica-Bold').fontSize(10.5).fillColor(PDF_COLORS.text).text(line, { width, align: line.startsWith('PROGRAMA') || line.startsWith('PRIMEIRO') ? 'center' : 'left' });
      continue;
    }
    const label = line.match(/^(CONTRATANTE:|CONTRATADO:|AFILIADO:|Representante legal:)\s?/);
    if (label) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(PDF_COLORS.text).text(label[0], { width, continued: true, align: 'justify' }).font('Helvetica').text(line.slice(label[0].length), { align: 'justify' });
      continue;
    }
    const numbered = line.match(/^(\d+\.\d+\.)\s/);
    if (numbered) {
      doc.font('Helvetica-Bold').fontSize(10).fillColor(PDF_COLORS.text).text(`${numbered[1]} `, { width, continued: true, align: 'justify' }).font('Helvetica').text(line.slice(numbered[0].length), { align: 'justify' });
      continue;
    }
    doc.font(HEADING.test(line) ? 'Helvetica-Bold' : 'Helvetica').fontSize(10).fillColor(PDF_COLORS.text).text(line, { width, align: 'justify' });
  }

  // Certificado de assinatura (sempre em página própria).
  doc.addPage();
  doc.font('Helvetica-Bold').fontSize(14).fillColor(PDF_COLORS.brand).text('Certificado de assinatura eletrônica', { width });
  doc.moveDown(0.2).font('Helvetica').fontSize(9.5).fillColor(PDF_COLORS.muted).text(pdfText(`${input.titulo} · nº ${input.numero}`), { width });
  doc.moveDown(0.8);
  const boxTop = doc.y;
  doc.save().roundedRect(60, boxTop, width, 44, 6).fill(PDF_COLORS.brandSoft).restore();
  doc.font('Helvetica-Bold').fontSize(8.5).fillColor(PDF_COLORS.muted).text('CÓDIGO DE VERIFICAÇÃO (SHA-256 DO TEXTO ASSINADO)', 72, boxTop + 8, { width: width - 24 });
  doc.font('Courier').fontSize(8.6).fillColor(PDF_COLORS.text).text(input.hash, 72, boxTop + 22, { width: width - 24 });
  doc.y = boxTop + 56;
  doc.x = 60;
  for (const block of input.blocks) {
    if (doc.y > doc.page.height - 160) doc.addPage();
    doc.moveDown(0.4).font('Helvetica-Bold').fontSize(11).fillColor(PDF_COLORS.brand).text(pdfText(block.title), 60, doc.y, { width });
    doc.moveDown(0.25);
    for (const [label, value] of block.rows) {
      const y = doc.y;
      doc.font('Helvetica-Bold').fontSize(9).fillColor(PDF_COLORS.muted).text(pdfText(label), 60, y, { width: 150 });
      const labelBottom = doc.y;
      doc.font('Helvetica').fontSize(9).fillColor(PDF_COLORS.text).text(pdfText(value || '—'), 215, y, { width: width - 155 });
      doc.y = Math.max(doc.y, labelBottom) + 3;
      doc.x = 60;
    }
  }
  doc.moveDown(0.8).font('Helvetica').fontSize(8.5).fillColor(PDF_COLORS.muted).text(pdfText(`Para conferir a autenticidade, compare o código de verificação acima com o registrado na plataforma${input.verifyUrl ? `: ${input.verifyUrl}` : '.'} Qualquer alteração no texto do contrato muda o código.`), 60, doc.y, { width });

  const range = doc.bufferedPageRange();
  for (let index = range.start; index < range.start + range.count; index += 1) {
    doc.switchToPage(index);
    if (input.watermark) drawWatermark(doc, input.watermark);
    const footerLine = `${input.footer} · nº ${input.numero} · Hash ${input.hash.slice(0, 16)}... · Página ${index - range.start + 1} de ${range.count}`;
    if (input.letterhead) { drawLetterhead(doc, input.letterhead, footerLine); continue; }
    doc.font('Helvetica').fontSize(7.5).fillColor(PDF_COLORS.muted);
    textInMargin(doc, pdfText(footerLine), 60, doc.page.height - 40, { width, align: 'center' });
  }
  doc.end();
  return done;
}
