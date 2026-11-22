import { BL_LOGO_PNG, SORTE_TECH_LOGO_PNG } from '../contracts/contract-brand';
import { DEFAULT_COMPANY } from '../contracts/contract-templates';
import { pdfText, PDF_COLORS, textInMargin } from './pdf.util';

/*
 * Identidade visual de todos os PDFs do sistema (contratos, recibos, relatórios):
 * Bolão Livre em destaque à esquerda, SORTE TECH à direita, linha azul, e a empresa no rodapé.
 */
export type Letterhead = { razaoSocial: string; cnpj: string; endereco?: string | null; site?: string | null };

export const BRAND_BLUE = '#2563EB';
const BL_RATIO = 900 / 170;
const ST_RATIO = 720 / 217;

/** Cada logo entra uma vez só no arquivo, mesmo com muitas páginas. */
const images = new WeakMap<PDFKit.PDFDocument, { bl: unknown; st: unknown }>();
function logos(doc: PDFKit.PDFDocument) {
  let found = images.get(doc);
  if (!found) {
    const open = (doc as unknown as { openImage: (src: Buffer) => unknown }).openImage.bind(doc);
    found = { bl: open(BL_LOGO_PNG), st: open(SORTE_TECH_LOGO_PNG) };
    images.set(doc, found);
  }
  return found as { bl: Buffer; st: Buffer };
}

const siteFromEnv = () => (process.env.APP_PUBLIC_URL || process.env.WEB_ORIGIN || '').replace(/^https?:\/\//, '').replace(/\/+$/, '') || null;
let current: Letterhead = { razaoSocial: DEFAULT_COMPANY.razaoSocial, cnpj: DEFAULT_COMPANY.cnpj, endereco: DEFAULT_COMPANY.endereco, site: siteFromEnv() };

/** Atualizado pelos contratos quando os dados da empresa mudam no painel. */
export function setLetterhead(next: Letterhead): void {
  current = { ...next, site: next.site ?? current.site ?? siteFromEnv() };
}

export function getLetterhead(): Letterhead {
  return current;
}

/** Cabeçalho com os dois logos. Devolve a altura onde o conteúdo pode começar. */
export function drawBrandHeader(doc: PDFKit.PDFDocument, options: { left: number; width: number; top: number; size?: 'normal' | 'compact' }): number {
  const compact = options.size === 'compact';
  const blHeight = compact ? 24 : 34;
  const stHeight = compact ? 19 : 26;
  const stWidth = ST_RATIO * stHeight;
  const right = options.left + options.width;
  doc.image(logos(doc).bl, options.left, options.top + (compact ? 2 : 4), { height: blHeight, width: BL_RATIO * blHeight });
  doc.font('Helvetica').fontSize(compact ? 5.8 : 6.5).fillColor(PDF_COLORS.muted);
  textInMargin(doc, 'UMA PLATAFORMA', right - stWidth, options.top, { width: stWidth, align: 'right', lineBreak: false });
  doc.image(logos(doc).st, right - stWidth, options.top + (compact ? 8 : 10), { height: stHeight, width: stWidth });
  const lineY = options.top + (compact ? 34 : 50);
  doc.save().moveTo(options.left, lineY).lineTo(right, lineY).lineWidth(compact ? 1 : 1.2).strokeColor(BRAND_BLUE).stroke().restore();
  doc.fillColor(PDF_COLORS.text);
  return lineY + (compact ? 10 : 16);
}

/** Rodapé: empresa, CNPJ, endereço e site; e uma linha extra (número, página...). */
export function drawBrandFooter(doc: PDFKit.PDFDocument, options: { left: number; width: number; top: number; extra?: string | null; letterhead?: Letterhead | null }): void {
  const l = options.letterhead ?? current;
  doc.save().moveTo(options.left, options.top).lineTo(options.left + options.width, options.top).lineWidth(0.6).strokeColor('#C7D2FE').stroke().restore();
  doc.font('Helvetica-Bold').fontSize(7.5).fillColor('#0F172A');
  textInMargin(doc, pdfText(`${l.razaoSocial} · CNPJ ${l.cnpj}`), options.left, options.top + 7, { width: options.width, align: 'center', lineBreak: false });
  doc.font('Helvetica').fontSize(7).fillColor(PDF_COLORS.muted);
  const address = [l.endereco, l.site].filter(Boolean).join(' · ');
  if (address) textInMargin(doc, pdfText(address), options.left, options.top + 18, { width: options.width, align: 'center', lineBreak: false });
  if (options.extra) {
    doc.font('Helvetica').fontSize(6.8).fillColor(PDF_COLORS.muted);
    textInMargin(doc, pdfText(options.extra), options.left, options.top + (address ? 30 : 19), { width: options.width, align: 'center', lineBreak: false });
  }
  doc.fillColor(PDF_COLORS.text);
}
