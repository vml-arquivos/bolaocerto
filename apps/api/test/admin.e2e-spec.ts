import { INestApplication, Module } from '@nestjs/common';
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
    await app.init();
  });

  afterAll(async () => { if (app) await app.close(); });

  it('expõe dashboard e listagens administrativas com resposta JSON', async () => {
    await request(app.getHttpServer()).get('/admin/dashboard').expect(200).expect(({ body }) => expect(body.kpis.usuarios).toBe(2));
    await request(app.getHttpServer()).get('/admin/boloes?page=1&pageSize=20').expect(200).expect(({ body }) => expect(body.pagination.page).toBe(1));
    await request(app.getHttpServer()).get('/admin/comissoes?status=pendente').expect(200).expect(({ body }) => expect(body.items).toEqual([]));
  });
});
