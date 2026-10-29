import { mkdtemp, readdir, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import { ConfigService } from '@nestjs/config';
import { AttachmentsService } from './attachments.service';
import { StorageService } from './storage.service';

const PDF = Buffer.from('%PDF-1.4\n' + 'conteudo do comprovante '.repeat(20));
const admin = { id: 'u-admin', email: 'a@a.com', papel: 'admin' as const };
const buyer = { id: 'u-buyer', email: 'b@b.com', papel: 'cotista' as const };
const stranger = { id: 'u-other', email: 'c@c.com', papel: 'cotista' as const };

interface Row { id: string; bolaoId: string; cotaId: string | null; tipo: string; nomeOriginal: string; mime: string; tamanho: number; sha256: string; caminho: string; descricao: string | null; visivelParticipantes: boolean; enviadoPor: string; criadoEm: Date; removidoEm: Date | null; removidoPor: string | null }

function setup(dir: string, shares: Array<{ id: string; bolaoId: string; compradorId: string; status: string }> = []) {
  const rows: Row[] = [];
  const notified: unknown[] = [];
  const audits: string[] = [];
  let seq = 0;
  const prisma: any = {
    $queryRaw: async () => [],
    bolao: { findUnique: async ({ where }: any) => (where.id === 'p1' ? { id: 'p1', status: 'fechado' } : null) },
    cota: {
      findMany: async ({ where }: any) => Array.from(new Map(shares.filter(s => s.bolaoId === where.bolaoId && (!where.id || where.id === s.id) && where.status.in.includes(s.status)).map(s => [s.compradorId, s])).values()),
      findUnique: async ({ where }: any) => shares.find((s) => s.id === where.id) ?? null,
      count: async ({ where }: any) => shares.filter((s) => s.bolaoId === where.bolaoId && s.compradorId === where.compradorId && where.status.in.includes(s.status)).length,
    },
    anexo: {
      findFirst: async ({ where }: any) => {
        const found = rows.find((r) => (where.id ? r.id === where.id : true) && (where.sha256 ? r.sha256 === where.sha256 && r.bolaoId === where.bolaoId && r.cotaId === where.cotaId : true) && r.removidoEm === null);
        return found ? { ...found, cota: shares.find((x) => x.id === found.cotaId) ?? null, bolao: { status: 'fechado', comprovanteUrl: null } } : null;
      },
      count: async ({ where }: any) => rows.filter((r) => r.bolaoId === where.bolaoId && r.removidoEm === null && (!where.id || r.id !== where.id.not) && where.tipo.in.includes(r.tipo)).length,
      create: async ({ data }: any) => { const row = { ...data, id: `a${++seq}`, criadoEm: new Date(), removidoEm: null, removidoPor: null, autor: { nome: 'Admin' } }; rows.push(row); return row; },
      update: async ({ where, data }: any) => { const row = rows.find((r) => r.id === where.id)!; Object.assign(row, data); return { ...row, autor: { nome: 'Admin' } }; },
    },
    $transaction: async (fn: any) => fn(prisma),
  };
  const config = { get: (key: string) => ({ UPLOAD_DIR: dir, UPLOAD_MAX_MB: '1' } as Record<string, string>)[key] } as unknown as ConfigService;
  const storage = new StorageService(config);
  const audit: any = { record: async (_tx: unknown, input: { evento: string }) => { audits.push(input.evento); } };
  const notifications: any = { notify: async (...args: unknown[]) => { notified.push(args); } };
  return { service: new AttachmentsService(prisma, storage, audit, notifications), rows, notified, audits, storage };
}

describe('AttachmentsService', () => {
  let dir: string;
  beforeEach(async () => { dir = await mkdtemp(join(tmpdir(), 'bl-up-')); });
  afterEach(async () => { await rm(dir, { recursive: true, force: true }); });

  it('guarda o arquivo, calcula o hash e audita', async () => {
    const { service, audits, storage } = setup(dir);
    const out = await service.upload('p1', { originalname: 'comprovante.pdf', buffer: PDF }, { tipo: 'comprovante_aposta' }, admin);
    expect(out.sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(out.mime).toBe('application/pdf');
    expect(audits).toContain('anexo.enviado');
    expect((await storage.usage()).arquivos).toBe(1);
  });

  it('recusa formato falso, arquivo vazio, grande demais e duplicado', async () => {
    const { service } = setup(dir);
    await expect(service.upload('p1', { originalname: 'x.pdf', buffer: Buffer.from('<html>oi oi oi oi oi oi</html>') }, { tipo: 'outro' }, admin)).rejects.toThrow(/Formato não aceito/);
    await expect(service.upload('p1', undefined, { tipo: 'outro' }, admin)).rejects.toThrow(/Escolha um arquivo/);
    await expect(service.upload('p1', { originalname: 'g.pdf', buffer: Buffer.concat([PDF, Buffer.alloc(1024 * 1024)]) }, { tipo: 'outro' }, admin)).rejects.toThrow(/passa de 1 MB/);
    await service.upload('p1', { originalname: 'a.pdf', buffer: PDF }, { tipo: 'outro' }, admin);
    await expect(service.upload('p1', { originalname: 'b.pdf', buffer: PDF }, { tipo: 'outro' }, admin)).rejects.toThrow(/já foi anexado/);
  });

  it('não deixa arquivo órfão no disco quando o banco falha', async () => {
    const { service, storage } = setup(dir);
    (service as any).prisma.$transaction = async () => { throw new Error('banco caiu'); };
    await expect(service.upload('p1', { originalname: 'a.pdf', buffer: PDF }, { tipo: 'outro' }, admin)).rejects.toThrow('banco caiu');
    expect((await storage.usage()).arquivos).toBe(0);
    expect(await readdir(dir)).toBeDefined();
  });

  it('recibo exige a cota certa e avisa o comprador', async () => {
    const { service, notified } = setup(dir, [{ id: 'c1', bolaoId: 'p1', compradorId: 'u-buyer', status: 'registrada' }, { id: 'c2', bolaoId: 'p1', compradorId: 'u-buyer', status: 'cancelada' }, { id: 'c9', bolaoId: 'outro', compradorId: 'u-buyer', status: 'paga' }]);
    await expect(service.upload('p1', { buffer: PDF }, { tipo: 'recibo_cota' }, admin)).rejects.toThrow(/Escolha a cota/);
    await expect(service.upload('p1', { buffer: PDF }, { tipo: 'comprovante_aposta', cotaId: 'c1' }, admin)).rejects.toThrow(/Só o recibo individual/);
    await expect(service.upload('p1', { buffer: PDF }, { tipo: 'recibo_cota', cotaId: 'c9' }, admin)).rejects.toThrow(/não encontrada/);
    await expect(service.upload('p1', { buffer: PDF }, { tipo: 'recibo_cota', cotaId: 'c2' }, admin)).rejects.toThrow(/cancelada/);
    await service.upload('p1', { originalname: 'recibo.pdf', buffer: PDF }, { tipo: 'recibo_cota', cotaId: 'c1' }, admin);
    expect(notified).toHaveLength(1);
  });

  it('só quem participa abre o comprovante do bolão; recibo é só do dono; oculto só a equipe', async () => {
    const { service } = setup(dir, [{ id: 'c1', bolaoId: 'p1', compradorId: 'u-buyer', status: 'registrada' }]);
    const proof = await service.upload('p1', { originalname: 'aposta.pdf', buffer: PDF }, { tipo: 'comprovante_aposta' }, admin);
    const receipt = await service.upload('p1', { originalname: 'recibo.pdf', buffer: Buffer.concat([PDF, Buffer.from('diferente')]) }, { tipo: 'recibo_cota', cotaId: 'c1' }, admin);
    expect((await service.openFor(proof.id, buyer)).mime).toBe('application/pdf');
    expect((await service.openFor(receipt.id, buyer)).nome).toBe('recibo.pdf');
    await expect(service.openFor(proof.id, stranger)).rejects.toThrow(/participa/);
    await expect(service.openFor(receipt.id, stranger)).rejects.toThrow(/acesso/);
    expect((await service.openFor(receipt.id, admin)).nome).toBe('recibo.pdf');
    await service.update(proof.id, { visivelParticipantes: false }, admin);
    await expect(service.openFor(proof.id, buyer)).rejects.toThrow(/acesso/);
    expect((await service.openFor(proof.id, { ...admin, papel: 'operacao' })).nome).toBe('aposta.pdf');
  });

  it('remoção é lógica e mantém o arquivo no disco; some da conferência', async () => {
    const { service, audits, storage, rows } = setup(dir);
    const file = await service.upload('p1', { originalname: 'a.pdf', buffer: PDF }, { tipo: 'outro' }, admin);
    await service.remove(file.id, admin);
    expect(audits).toContain('anexo.removido');
    expect(rows[0]?.removidoEm).toBeInstanceOf(Date);
    expect((await storage.usage()).arquivos).toBe(1);
    await expect(service.openFor(file.id, admin)).rejects.toThrow(/não encontrado/i);
  });
});

describe('General proof delivery', () => {
  it('notifies each paid participant once, excluding unpaid reservations and cancelled shares', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bl-notify-'));
    try {
      const { service, notified } = setup(dir, [
        { id: '1', bolaoId: 'p1', compradorId: 'paid', status: 'paga' },
        { id: '2', bolaoId: 'p1', compradorId: 'paid', status: 'registrada' },
        { id: '3', bolaoId: 'p1', compradorId: 'unpaid', status: 'reservada' },
        { id: '4', bolaoId: 'p1', compradorId: 'cancelled', status: 'cancelada' },
      ]);
      await service.upload('p1', { buffer: PDF }, { tipo: 'comprovante_aposta' }, admin);
      expect(notified).toHaveLength(1);
      expect((notified[0] as unknown[])[0]).toBe('paid');
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
  it('does not notify participants about a staff-only file until it is made visible', async () => {
    const dir = await mkdtemp(join(tmpdir(), 'bl-notify-'));
    try {
      const { service, notified } = setup(dir, [{ id: '1', bolaoId: 'p1', compradorId: 'paid', status: 'paga' }]);
      const file = await service.upload('p1', { buffer: PDF }, { tipo: 'comprovante_aposta', visivelParticipantes: false }, admin);
      expect(notified).toHaveLength(0);
      await service.update(file.id, { visivelParticipantes: true }, admin);
      expect(notified).toHaveLength(1);
      await service.update(file.id, { descricao: 'Correção de descrição' }, admin);
      expect(notified).toHaveLength(1);
    } finally { await rm(dir, { recursive: true, force: true }); }
  });
});
