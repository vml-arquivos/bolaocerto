import { INestApplication, UnauthorizedException, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { AdminUsersController } from '../src/admin/admin-users.controller';
import { AdminUsersService } from '../src/admin/admin-users.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
const ID = '11111111-1111-4111-8111-111111111111';
describe('User management HTTP contract', () => {
  let app: INestApplication;
  const users = { detail: jest.fn().mockResolvedValue({ id: ID, nome: 'Pessoa' }), edit: jest.fn().mockResolvedValue({ id: ID }), setActive: jest.fn().mockResolvedValue({ id: ID, ativo: false }), sendReset: jest.fn().mockResolvedValue({ enviado: true }) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [AdminUsersController], providers: [{ provide: AdminUsersService, useValue: users }] })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate(context: any) { const req = context.switchToHttp().getRequest(); const role = req.headers['x-role']; if (!role) throw new UnauthorizedException(); req.user = { id: 'actor', papel: role, email: 'actor@example.invalid' }; return true; } })
      .overrideGuard(RolesGuard).useValue(new RolesGuard(new Reflector())).compile();
    app = module.createNestApplication(); app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true })); await app.init();
  });
  afterAll(async () => { await app.close(); });
  it('requires authentication and an admin role for all mutations', async () => {
    await request(app.getHttpServer()).get(`/admin/usuarios/${ID}`).expect(401);
    for (const role of ['cotista', 'afiliado', 'operacao']) {
      await request(app.getHttpServer()).delete(`/admin/usuarios/${ID}`).set('x-role', role).expect(403);
      await request(app.getHttpServer()).post(`/admin/usuarios/${ID}/reenviar-senha`).set('x-role', role).expect(403);
    }
  });
  it('validates ids and excludes credentials or privilege fields from profile edits', async () => {
    await request(app.getHttpServer()).get('/admin/usuarios/invalid').set('x-role', 'admin').expect(400);
    for (const field of ['senhaHash', 'senha', 'papel', 'cpf', 'tokenVersion']) {
      await request(app.getHttpServer()).patch(`/admin/usuarios/${ID}`).set('x-role', 'admin').send({ nome: 'Pessoa', email: 'test@example.invalid', [field]: 'unexpected' }).expect(400);
    }
  });
  it('accepts a valid profile edit', async () => {
    await request(app.getHttpServer()).patch(`/admin/usuarios/${ID}`).set('x-role', 'admin').send({ nome: 'Pessoa', email: 'test@example.invalid', telefone: '', dataNascimento: '1990-01-01' }).expect(200);
    expect(users.edit).toHaveBeenCalled();
  });
  it('returns private non-cacheable details', async () => {
    const r = await request(app.getHttpServer()).get(`/admin/usuarios/${ID}`).set('x-role', 'admin').expect(200);
    expect(r.headers['cache-control']).toBe('private, no-store');
  });
  it('routes removal, restoration and reset email separately', async () => {
    await request(app.getHttpServer()).delete(`/admin/usuarios/${ID}`).set('x-role', 'admin').expect(200);
    expect(users.setActive).toHaveBeenLastCalledWith(ID, false, expect.any(Object));
    await request(app.getHttpServer()).post(`/admin/usuarios/${ID}/reativar`).set('x-role', 'admin').expect(201);
    expect(users.setActive).toHaveBeenLastCalledWith(ID, true, expect.any(Object));
    await request(app.getHttpServer()).post(`/admin/usuarios/${ID}/reenviar-senha`).set('x-role', 'admin').expect(201);
    expect(users.sendReset).toHaveBeenCalledWith(ID, expect.any(Object));
  });
});
