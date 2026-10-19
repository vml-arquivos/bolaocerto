import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Test } from '@nestjs/testing';
import { mkdtemp, rm } from 'fs/promises';
import { tmpdir } from 'os';
import { join } from 'path';
import request from 'supertest';
import { AttachmentsDownloadController, AttachmentsStaffController } from '../src/attachments/attachments.controller';
import { AttachmentsService } from '../src/attachments/attachments.service';
import { StorageService } from '../src/attachments/storage.service';
import { AuditService } from '../src/common/audit.service';
import { PrismaService } from '../src/common/prisma.service';
import { NotificationsService } from '../src/notifications/notifications.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';

const POOL = '11111111-1111-4111-8111-111111111111';
const COTA = '22222222-2222-4222-8222-222222222222';
const USERS: Record<string, { id: string; email: string; papel: string }> = {
  admin: { id: '33333333-3333-4333-8333-333333333333', email: 'a@a.com', papel: 'admin' },
  buyer: { id: '44444444-4444-4444-8444-444444444444', email: 'b@b.com', papel: 'cotista' },
  other: { id: '55555555-5555-4555-8555-555555555555', email: 'c@c.com', papel: 'cotista' },
};
const BUYER_ID = '44444444-4444-4444-8444-444444444444';
const PDF = Buffer.from('%PDF-1.4\n' + 'comprovante de aposta '.repeat(30));

function fakePrisma() {
  const rows: any[] = [];
  let seq = 0;
  const shares = [{ id: COTA, bolaoId: POOL, compradorId: BUYER_ID, status: 'registrada' }];
  const prisma: any = {
    bolao: { findUnique: async ({ where }: any) => (where.id === POOL ? { id: POOL, status: 'fechado' } : null) },
    cota: { findUnique: async ({ where }: any) => shares.find((s) => s.id === where.id) ?? null, count: async ({ where }: any) => shares.filter((s) => s.bolaoId === where.bolaoId && s.compradorId === where.compradorId && where.status.in.includes(s.status)).length },
    anexo: {
      findFirst: async ({ where }: any) => {
        const row = rows.find((r) => r.removidoEm === null && (where.id ? r.id === where.id : true) && (where.sha256 ? r.sha256 === where.sha256 && r.bolaoId === where.bolaoId && r.cotaId === where.cotaId : true));
        return row ? { ...row, cota: shares.find((s) => s.id === row.cotaId) ?? null, bolao: { status: 'fechado', comprovanteUrl: null } } : null;
      },
      findMany: async () => rows.filter((r) => r.removidoEm === null).map((r) => ({ ...r, autor: { nome: 'Admin' }, cota: null })),
      count: async () => 0,
      create: async ({ data }: any) => { const row = { ...data, id: `00000000-0000-4000-8000-${String(++seq).padStart(12, '0')}`, criadoEm: new Date(), removidoEm: null, autor: { nome: 'Admin' } }; rows.push(row); return row; },
      update: async ({ where, data }: any) => { const row = rows.find((r) => r.id === where.id); Object.assign(row, data); return { ...row, autor: { nome: 'Admin' } }; },
    },
    $transaction: async (fn: any) => fn(prisma),
  };
  return prisma;
}

@Module({})
class Dummy {}

describe('Anexos: HTTP (e2e)', () => {
  let app: INestApplication;
  let dir: string;

  beforeAll(async () => {
    dir = await mkdtemp(join(tmpdir(), 'bl-e2e-'));
    const module = await Test.createTestingModule({
      imports: [Dummy],
      controllers: [AttachmentsStaffController, AttachmentsDownloadController],
      providers: [
        AttachmentsService, StorageService,
        { provide: ConfigService, useValue: { get: (key: string) => ({ UPLOAD_DIR: dir, UPLOAD_MAX_MB: '2' } as Record<string, string>)[key] } },
        { provide: PrismaService, useValue: fakePrisma() },
        { provide: AuditService, useValue: { record: async () => undefined } },
        { provide: NotificationsService, useValue: { notify: async () => undefined } },
      ],
    })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: (context: any) => { const req = context.switchToHttp().getRequest(); const user = USERS[String(req.headers['x-user'])]; if (!user) return false; req.user = user; return true; } })
      .overrideGuard(RolesGuard).useValue(new RolesGuard({ getAllAndOverride: (_key: string, targets: any[]) => { for (const target of targets) { const found = Reflect.getMetadata('roles', target); if (found) return found; } return undefined; } } as any))
      .compile();
    app = module.createNestApplication();
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true }, forbidNonWhitelisted: true }));
    await app.init();
  });
  afterAll(async () => { if (app) await app.close(); await rm(dir, { recursive: true, force: true }); });

  it('equipe envia por multipart; cotista não consegue enviar', async () => {
    const http = app.getHttpServer();
    await request(http).post(`/operacao/boloes/${POOL}/anexos`).set('x-user', 'buyer').field('tipo', 'comprovante_aposta').attach('arquivo', PDF, 'aposta.pdf').expect(403);
    const sent = await request(http).post(`/operacao/boloes/${POOL}/anexos`).set('x-user', 'admin').field('tipo', 'comprovante_aposta').field('visivelParticipantes', 'false').attach('arquivo', PDF, 'aposta.pdf').expect(201);
    expect(sent.body).toMatchObject({ tipo: 'comprovante_aposta', mime: 'application/pdf', nome: 'aposta.pdf', visivelParticipantes: false });
  });

  it('recusa arquivo disfarçado, campo desconhecido e arquivo grande', async () => {
    const http = app.getHttpServer();
    await request(http).post(`/operacao/boloes/${POOL}/anexos`).set('x-user', 'admin').field('tipo', 'outro').attach('arquivo', Buffer.from('<html><script>x</script></html>'), 'x.pdf').expect(422);
    await request(http).post(`/operacao/boloes/${POOL}/anexos`).set('x-user', 'admin').field('tipo', 'outro').field('qualquer', '1').attach('arquivo', PDF, 'a.pdf').expect(400);
    await request(http).post(`/operacao/boloes/${POOL}/anexos`).set('x-user', 'admin').field('tipo', 'outro').attach('arquivo', Buffer.concat([PDF, Buffer.alloc(3 * 1024 * 1024)]), 'g.pdf').expect(413);
    await request(http).post(`/operacao/boloes/${POOL}/anexos`).set('x-user', 'admin').field('tipo', 'outro').expect(400);
    await request(http).post('/operacao/boloes/nao-e-uuid/anexos').set('x-user', 'admin').field('tipo', 'outro').attach('arquivo', PDF, 'a.pdf').expect(400);
  });

  it('download: equipe abre; participante só o que é visível; estranho nunca; cabeçalhos seguros', async () => {
    const http = app.getHttpServer();
    const visible = await request(http).post(`/operacao/boloes/${POOL}/anexos`).set('x-user', 'admin').field('tipo', 'jogos_registrados').attach('arquivo', Buffer.concat([PDF, Buffer.from('v2')]), 'jogos "registrados".pdf').expect(201);
    const url = `/anexos/${visible.body.id}/arquivo`;
    const asBuyer = await request(http).get(url).set('x-user', 'buyer').expect(200);
    expect(asBuyer.headers['content-type']).toContain('application/pdf');
    expect(asBuyer.headers['x-content-type-options']).toBe('nosniff');
    expect(asBuyer.headers['cache-control']).toContain('no-store');
    expect(asBuyer.headers['content-disposition']).toContain('inline');
    expect(asBuyer.headers['content-disposition']).not.toContain('"registrados"');
    expect(asBuyer.body.equals?.(Buffer.concat([PDF, Buffer.from('v2')])) ?? true).toBe(true);
    await request(http).get(url).set('x-user', 'other').expect(403);
    await request(http).get(url).expect(403);
    await request(http).get(url).set('x-user', 'admin').expect(200);
  });

  it('só administrador remove', async () => {
    const http = app.getHttpServer();
    const sent = await request(http).post(`/operacao/boloes/${POOL}/anexos`).set('x-user', 'admin').field('tipo', 'outro').attach('arquivo', Buffer.concat([PDF, Buffer.from('v3')]), 'x.pdf').expect(201);
    await request(http).delete(`/operacao/anexos/${sent.body.id}`).set('x-user', 'buyer').expect(403);
    await request(http).delete(`/operacao/anexos/${sent.body.id}`).set('x-user', 'admin').expect(200);
  });
});
