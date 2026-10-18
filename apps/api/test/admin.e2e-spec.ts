import { INestApplication, Module, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';
import { AdminController } from '../src/admin/admin.controller';
import { AdminService } from '../src/admin/admin.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';

const adminService = {
  dashboard: jest.fn().mockResolvedValue({ kpis: { usuarios: 2 }, graficos: {} }),
  listContests: jest.fn().mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, total: 0, pages: 0 } }),
  listPools: jest.fn().mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, total: 0, pages: 0 } }),
  listShares: jest.fn().mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, total: 0, pages: 0 } }),
  listPayments: jest.fn().mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, total: 0, pages: 0 } }),
  listCommissions: jest.fn().mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, total: 0, pages: 0 } }),
  listRemittances: jest.fn().mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, total: 0, pages: 0 } }),
  listAffiliates: jest.fn().mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, total: 0, pages: 0 } }),
  listUsers: jest.fn().mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, total: 0, pages: 0 } }),
  listAudit: jest.fn().mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, total: 0, pages: 0 } }),
  listLotericas: jest.fn().mockResolvedValue({ items: [], pagination: { page: 1, pageSize: 20, total: 0, pages: 0 } }),
  syncLotteries: jest.fn().mockResolvedValue({ ok: true }),
};

@Module({ controllers: [AdminController], providers: [{ provide: AdminService, useValue: adminService }, { provide: JwtAuthGuard, useValue: { canActivate: () => true } }, { provide: RolesGuard, useValue: { canActivate: () => true } }] })
class AdminE2eModule {}

describe('Admin HTTP contract (e2e)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    const module = await Test.createTestingModule({ imports: [AdminE2eModule] })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate: () => true })
      .overrideGuard(RolesGuard).useValue({ canActivate: () => true })
      .compile();
    app = module.createNestApplication();
    // Mesmas opções do main.ts: parâmetros desconhecidos viram erro 400 (foi o que quebrou a Visão geral).
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true, transformOptions: { enableImplicitConversion: true }, forbidNonWhitelisted: true }));
    await app.init();
  });

  afterAll(async () => { if (app) await app.close(); });

  it('expõe dashboard e listagens administrativas com resposta JSON', async () => {
    await request(app.getHttpServer()).get('/admin/dashboard').expect(200).expect(({ body }) => expect(body.kpis.usuarios).toBe(2));
    await request(app.getHttpServer()).get('/admin/boloes?page=1&pageSize=20').expect(200).expect(({ body }) => expect(body.pagination.page).toBe(1));
    await request(app.getHttpServer()).get('/admin/comissoes?status=pendente').expect(200).expect(({ body }) => expect(body.items).toEqual([]));
  });

  it('aceita exatamente as consultas que o painel web envia (regressão: "property page should not exist")', async () => {
    const http = app.getHttpServer();
    await request(http).get('/admin/dashboard?periodo=30d').expect(200);
    await request(http).get('/admin/dashboard?page=1&pageSize=50&periodo=30d').expect(200); // versão antiga do site em cache
    for (const path of ['concursos?page=1&pageSize=30&status=aberto', 'concursos?page=1&pageSize=100&status=aberto', 'boloes?page=1&pageSize=50&busca=virada', 'cotas?page=1&pageSize=50&status=paga', 'recebimentos?page=1&pageSize=50', 'afiliados?page=1&pageSize=100']) {
      await request(http).get(`/admin/${path}`).expect((response) => { if (response.status === 400) throw new Error(`${path}: ${JSON.stringify(response.body)}`); });
    }
  });
});
