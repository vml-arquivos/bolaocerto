import { BadRequestException, NotFoundException } from '@nestjs/common';
import { LegalPublishingService, assertKind } from './legal-publishing.service';
import { documentSource, legalDocument, setPublishedDocuments } from './documents';

const actor = { id: 'a0000000-0000-4000-8000-000000000001', email: 'adm@example.com', papel: 'admin' } as never;
const LONG = 'TERMOS DE USO DEFINITIVOS. '.repeat(20);

function make() {
  const rows: Array<Record<string, unknown>> = [];
  const audit = { record: jest.fn(async () => undefined) };
  const tx = {
    documentoPublicado: {
      updateMany: jest.fn(async ({ where }: { where: { tipo: string } }) => { rows.filter((r) => r.tipo === where.tipo && r.ativo).forEach((r) => { r.ativo = false; }); }),
      create: jest.fn(async ({ data }: { data: Record<string, unknown> }) => { const row = { id: `d0000000-0000-4000-8000-00000000000${rows.length + 1}`, publicadoEm: new Date(), ...data }; rows.push(row); return row; }),
    },
  };
  const prisma = {
    documentoPublicado: {
      findMany: jest.fn(async ({ where }: { where?: { ativo?: boolean } } = {}) => rows.filter((r) => where?.ativo === undefined || r.ativo === where.ativo)),
      findFirst: jest.fn(async ({ where }: { where: { tipo: string; ativo?: boolean } }) => [...rows].reverse().find((r) => r.tipo === where.tipo && (where.ativo === undefined || r.ativo === where.ativo)) ?? null),
      count: jest.fn(async ({ where }: { where: { tipo: string } }) => rows.filter((r) => r.tipo === where.tipo).length),
      ...tx.documentoPublicado,
    },
    $transaction: jest.fn(async (fn: (t: typeof tx) => unknown) => fn(tx)),
  };
  return { service: new LegalPublishingService(prisma as never, audit as never), rows, audit, prisma };
}

describe('LegalPublishingService', () => {
  afterEach(() => setPublishedDocuments({}));

  it('rejeita tipo de documento desconhecido', () => {
    expect(() => assertKind('qualquer')).toThrow(NotFoundException);
    expect(assertKind('termos')).toBe('termos');
  });

  it('publica: o texto novo passa a valer na hora, com hash novo e registro de auditoria', async () => {
    const { service, rows, audit } = make();
    const before = legalDocument('termos').hash;
    const result = await service.publish('termos', { texto: LONG }, actor);
    expect(result.versao).toMatch(/^\d{4}-\d{2}-\d{2}\.1$/);
    expect(documentSource('termos')).toBe('painel');
    expect(legalDocument('termos').hash).not.toBe(before);
    expect(legalDocument('termos').hash).toBe(result.hash);
    expect(rows).toHaveLength(1);
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ evento: 'documento.publicado', atorId: (actor as { id: string }).id }));
  });

  it('uma segunda publicação substitui a primeira e mantém o histórico', async () => {
    const { service, rows } = make();
    await service.publish('privacidade', { texto: LONG }, actor);
    await service.publish('privacidade', { texto: `${LONG} Atualizado.` }, actor);
    expect(rows).toHaveLength(2);
    expect(rows.filter((r) => r.ativo)).toHaveLength(1);
    expect(legalDocument('privacidade').texto.endsWith('Atualizado.')).toBe(true);
    expect(rows[1]!.versao).toMatch(/\.2$/);
  });

  it('recusa texto curto e texto igual ao que já vale', async () => {
    const { service } = make();
    await expect(service.publish('termos', { texto: 'curto' }, actor)).rejects.toThrow(BadRequestException);
    await service.publish('termos', { texto: LONG }, actor);
    await expect(service.publish('termos', { texto: LONG }, actor)).rejects.toThrow(/igual/);
  });

  it('voltar ao padrão desativa o texto publicado e guarda o histórico', async () => {
    const { service, rows, audit } = make();
    await service.publish('termos', { texto: LONG }, actor);
    await service.revert('termos', actor);
    expect(documentSource('termos')).toBe('arquivo');
    expect(rows).toHaveLength(1);
    expect(rows[0]!.ativo).toBe(false);
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ evento: 'documento.voltou_ao_padrao' }));
    await expect(service.revert('termos', actor)).rejects.toThrow(/padrão/);
  });

  it('se o banco falhar ao recarregar, mantém o que estava em memória', async () => {
    const { service, prisma } = make();
    await service.publish('termos', { texto: LONG }, actor);
    prisma.documentoPublicado.findMany.mockRejectedValueOnce(new Error('banco fora'));
    await service.refresh();
    expect(documentSource('termos')).toBe('painel');
  });
});
