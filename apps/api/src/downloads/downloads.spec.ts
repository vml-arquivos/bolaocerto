import { BadRequestException } from '@nestjs/common';
import { inflateRawSync } from 'node:zlib';
import { DownloadsService, MAX_FILES, toCsv } from './downloads.service';
import { buildZip } from './zip.util';

/** Lê um .zip pelo diretório central (o mesmo caminho que Windows, macOS e celulares usam). */
function readZip(zip: Buffer): Record<string, Buffer> {
  const end = zip.lastIndexOf(Buffer.from([0x50, 0x4b, 0x05, 0x06]));
  const count = zip.readUInt16LE(end + 10);
  let pos = zip.readUInt32LE(end + 16);
  const files: Record<string, Buffer> = {};
  for (let i = 0; i < count; i += 1) {
    expect(zip.readUInt32LE(pos)).toBe(0x02014b50);
    const method = zip.readUInt16LE(pos + 10); const size = zip.readUInt32LE(pos + 20); const nameLength = zip.readUInt16LE(pos + 28);
    const offset = zip.readUInt32LE(pos + 42); const name = zip.subarray(pos + 46, pos + 46 + nameLength).toString('utf8');
    const localNameLength = zip.readUInt16LE(offset + 26);
    const body = zip.subarray(offset + 30 + localNameLength, offset + 30 + localNameLength + size);
    files[name] = method === 8 ? inflateRawSync(body) : Buffer.from(body);
    pos += 46 + nameLength;
  }
  return files;
}

describe('buildZip', () => {
  it('gera um zip válido, com acentos no nome e sem sobrescrever nomes repetidos', () => {
    const big = Buffer.from('a'.repeat(5000));
    const files = readZip(buildZip([{ name: 'notas/nota-1.pdf', data: Buffer.from('%PDF-1') }, { name: 'recibos/João.txt', data: big }, { name: 'notas/nota-1.pdf', data: Buffer.from('outro') }]));
    expect(Object.keys(files)).toEqual(['notas/nota-1.pdf', 'recibos/João.txt', 'notas/nota-1 (2).pdf']);
    expect(files['recibos/João.txt']!.equals(big)).toBe(true);
    expect(files['notas/nota-1 (2).pdf']!.toString()).toBe('outro');
  });

  it('planilha com separador ; e acentos para o Excel', () => {
    const csv = toCsv(['Nome', 'Valor'], [['José; da Silva', '10,00']]).toString('utf8');
    expect(csv.startsWith('﻿Nome;Valor')).toBe(true);
    expect(csv).toContain('"José; da Silva";10,00');
  });
});

describe('DownloadsService', () => {
  const admin = { id: 'a1', papel: 'admin' } as never;
  const payment = (id: string) => ({ valorBruto: 20, metodo: 'pix', confirmadoEm: new Date('2026-11-10T15:00:00Z'), cotaId: `${id}0000000-0000-0000-0000-000000000000`.slice(0, 36), cota: { comprador: { nome: 'Ana', email: 'ana@x.com' }, bolao: { concurso: { modalidade: 'Mega-Sena', numeroConcurso: 3000 } } } });
  function setup(opts: { payments?: unknown[]; notes?: unknown[]; fetchOk?: boolean } = {}) {
    const prisma = { pagamento: { findMany: jest.fn().mockResolvedValue(opts.payments ?? [payment('a'), payment('b')]) }, notaFiscal: { findMany: jest.fn().mockResolvedValue(opts.notes ?? []) } };
    const shares = { getReceiptPdf: jest.fn().mockImplementation(async (id: string) => ({ filename: `recibo-${id.slice(0, 4)}.pdf`, buffer: Buffer.from('%PDF') })) };
    const config = { get: jest.fn().mockReturnValue('tok') };
    return { service: new DownloadsService(prisma as never, shares as never, config as never), prisma, shares };
  }

  it('filtra pelo período em horário de Brasília e recusa data invertida', async () => {
    const { service, prisma } = setup();
    await service.listReceipts({ de: '2026-11-01', ate: '2026-11-10' });
    const where = prisma.pagamento.findMany.mock.calls[0][0].where;
    expect(where.confirmadoEm.gte.toISOString()).toBe('2026-11-01T03:00:00.000Z');
    expect(where.confirmadoEm.lte.toISOString()).toBe('2026-11-11T02:59:59.999Z');
    expect(() => service.range({ de: '2026-11-10', ate: '2026-11-01' })).toThrow(BadRequestException);
    expect(() => service.range({ de: '10/11/2026' })).toThrow(BadRequestException);
  });

  it('baixa todos os recibos do período num zip com planilha', async () => {
    const { service, shares } = setup();
    const file = await service.receiptsZip({ de: '2026-11-01', ate: '2026-11-10' }, admin);
    expect(file.filename).toBe('recibos_2026-11-01_a_2026-11-10.zip');
    const files = readZip(file.buffer);
    expect(Object.keys(files).sort()).toEqual(['recibos.csv', 'recibos/recibo-a000.pdf', 'recibos/recibo-b000.pdf']);
    expect(shares.getReceiptPdf).toHaveBeenCalledWith(expect.any(String), admin);
    expect(files['recibos.csv']!.toString()).toContain('Ana;ana@x.com;Mega-Sena;3000;20,00;pix');
  });

  it('sem recibos no período avisa em vez de baixar arquivo vazio', async () => {
    await expect(setup({ payments: [] }).service.receiptsZip({}, admin)).rejects.toThrow(/Nenhum recibo/);
  });

  it('notas: põe PDF e XML no zip e lista o que não deu para baixar', async () => {
    const note = (numero: string, pdf: string | null) => ({ id: `n${numero}`, numero, status: 'emitida', origem: 'focus', valor: 1.6, pdfUrl: pdf, xmlUrl: null, emitidaEm: new Date(), criadoEm: new Date(), pagamento: { cota: { comprador: { nome: 'José Silva', email: 'j@x.com' } } } });
    const { service } = setup({ notes: [note('10', 'https://api.focusnfe.com.br/arquivos/10.pdf'), note('11', 'https://falha.example/11.pdf'), { ...note('12', null), status: 'erro' }] });
    const spy = jest.spyOn(global, 'fetch').mockImplementation(async (url) => (String(url).includes('falha') ? { ok: false } : { ok: true, arrayBuffer: async () => new TextEncoder().encode('%PDF-nota').buffer }) as Response);
    try {
      const files = readZip((await service.notesZip({})).buffer);
      expect(Object.keys(files)).toEqual(['notas.csv', 'notas/nota-10_Jose-Silva.pdf', 'LEIA-ME.txt']);
      expect(files['LEIA-ME.txt']!.toString()).toContain('https://falha.example/11.pdf');
      expect(files['notas.csv']!.toString()).not.toContain(';12;');
      const focusCall = spy.mock.calls.find(([url]) => String(url).includes('focusnfe'))!;
      expect((focusCall[1] as RequestInit).headers).toMatchObject({ Authorization: expect.stringMatching(/^Basic /) });
      expect((spy.mock.calls.find(([url]) => String(url).includes('falha'))![1] as RequestInit).headers).toEqual({});
    } finally { spy.mockRestore(); }
  });

  it('limite de arquivos por zip', () => { expect(MAX_FILES).toBeGreaterThanOrEqual(100); });
});
