import ExcelJS from 'exceljs';

export type CellValue = string | number | boolean | Date | null | undefined;
export type Row = Record<string, CellValue>;
export interface Column { key: string; header: string; width?: number; type?: 'money' | 'date' | 'int' | 'text'; /** Soma a coluna na linha de totais do PDF. */ sum?: boolean }
export interface Sheet { name: string; columns: Column[]; rows: Row[] }

const brDate = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', hour12: false });

export function formatDateBr(value: Date): string {
  return brDate.format(value).replace(',', '');
}

/** Evita injeção de fórmulas ao abrir CSV/XLSX no Excel. */
export function sanitizeCell(value: string): string {
  return /^[=+\-@\t\r]/.test(value) ? `'${value}` : value;
}

function csvCell(value: CellValue, type: Column['type']): string {
  if (value === null || value === undefined || value === '') return '';
  let text: string;
  if (value instanceof Date) text = formatDateBr(value);
  else if (typeof value === 'number') text = type === 'money' ? value.toFixed(2).replace('.', ',') : String(value).replace('.', ',');
  else text = sanitizeCell(String(value));
  return /[";\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

/** CSV em UTF-8 com BOM e separador ";" (abre corretamente no Excel em português). */
export function buildCsv(columns: Column[], rows: Row[]): Buffer {
  const lines = [columns.map((column) => csvCell(column.header, 'text')).join(';')];
  for (const row of rows) lines.push(columns.map((column) => csvCell(row[column.key], column.type)).join(';'));
  return Buffer.from(`\uFEFF${lines.join('\r\n')}\r\n`, 'utf8');
}

export async function buildXlsx(sheets: Sheet[], title: string): Promise<Buffer> {
  const workbook = new ExcelJS.Workbook();
  workbook.creator = 'BL — Bolão Livre';
  workbook.title = title;
  workbook.created = new Date();
  for (const sheet of sheets) {
    const worksheet = workbook.addWorksheet(sheet.name.slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
    worksheet.columns = sheet.columns.map((column) => ({
      header: column.header,
      key: column.key,
      width: column.width ?? (column.type === 'money' ? 16 : column.type === 'date' ? 18 : 22),
      style: column.type === 'money' ? { numFmt: '"R$" #,##0.00' } : column.type === 'date' ? { numFmt: 'dd/mm/yyyy hh:mm' } : column.type === 'int' ? { numFmt: '0' } : {},
    }));
    for (const row of sheet.rows) {
      const cleaned: Row = {};
      for (const column of sheet.columns) {
        const value = row[column.key];
        cleaned[column.key] = typeof value === 'string' ? sanitizeCell(value) : value;
      }
      worksheet.addRow(cleaned);
    }
    const header = worksheet.getRow(1);
    header.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    header.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1F3A5F' } };
    header.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    header.height = 28;
    if (sheet.rows.length > 0) worksheet.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: sheet.columns.length } };
  }
  return Buffer.from(await workbook.xlsx.writeBuffer());
}

export function maskCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  return digits.length === 11 ? `***.***.${digits.slice(6, 9)}-${digits.slice(9)}` : '***';
}

export function formatCpf(cpf: string): string {
  const digits = cpf.replace(/\D/g, '');
  return digits.length === 11 ? `${digits.slice(0, 3)}.${digits.slice(3, 6)}.${digits.slice(6, 9)}-${digits.slice(9)}` : cpf;
}
