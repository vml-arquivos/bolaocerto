import { INestApplication, UnauthorizedException } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { Reflector } from '@nestjs/core';
import request from 'supertest';
import { AccountController } from '../src/account/account.controller';
import { AccountService } from '../src/account/account.service';
import { AuthService } from '../src/auth/auth.service';
import { ResponsiblePlayService } from '../src/common/responsible-play.service';
import { JwtAuthGuard } from '../src/auth/jwt-auth.guard';
import { RolesGuard } from '../src/auth/roles.guard';
const ID = '11111111-1111-4111-8111-111111111111';
describe('Manual password link HTTP', () => {
  let app: INestApplication;
  const account = { adminResetLink: jest.fn().mockResolvedValue({ link: 'https://example.invalid/redefinir-senha?token=test', expiraEm: '2026-10-29T20:00:00Z' }) };
  beforeAll(async () => {
    const module = await Test.createTestingModule({ controllers: [AccountController], providers: [{ provide: AccountService, useValue: account }, { provide: AuthService, useValue: {} }, { provide: ResponsiblePlayService, useValue: {} }] })
      .overrideGuard(JwtAuthGuard).useValue({ canActivate(ctx: any) { const req = ctx.switchToHttp().getRequest(); if (!req.headers['x-role']) throw new UnauthorizedException(); req.user = { id: 'admin', papel: req.headers['x-role'] }; return true; } })
      .overrideGuard(RolesGuard).useValue(new RolesGuard(new Reflector())).compile();
    app = module.createNestApplication(); await app.init();
  });
  afterAll(async () => { await app.close(); });
  it('only allows administrators to generate links', async () => {
    await request(app.getHttpServer()).post(`/admin/usuarios/${ID}/redefinicao-senha`).expect(401);
    for (const role of ['cotista', 'afiliado', 'operacao']) await request(app.getHttpServer()).post(`/admin/usuarios/${ID}/redefinicao-senha`).set('x-role', role).expect(403);
    expect(account.adminResetLink).not.toHaveBeenCalled();
  });
  it('returns a non-cacheable link and validates the user id', async () => {
    await request(app.getHttpServer()).post('/admin/usuarios/invalid/redefinicao-senha').set('x-role', 'admin').expect(400);
    const result = await request(app.getHttpServer()).post(`/admin/usuarios/${ID}/redefinicao-senha`).set('x-role', 'admin').expect(200);
    expect(result.headers['cache-control']).toBe('private, no-store');
    expect(account.adminResetLink).toHaveBeenCalledWith(ID, 'admin');
  });
});
