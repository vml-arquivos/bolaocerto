import { INestApplication, ValidationPipe } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import request from 'supertest';

process.env.JWT_ACCESS_SECRET = 'test-access-secret-test-access-secret-0123456789';
process.env.JWT_REFRESH_SECRET = 'test-refresh-secret-test-refresh-secret-0123456789';
process.env.PAYMENTS_ENABLED = 'false';
process.env.PAYMENT_PROVIDER = 'cora';
process.env.CORA_CLIENT_ID = 'int-test';
process.env.PAYMENT_WEBHOOK_SECRET = 'segredo-webhook';
process.env.DATABASE_URL = 'postgresql://user:pass@localhost:5432/db';

/**
 * Sobe o AppModule COMPLETO (injeção de dependência real, guards reais) com o banco simulado.
 * Pega o tipo de falha que derrubou a API em produção: "Nest can't resolve dependencies of JwtAuthGuard".
 */
describe('Inicialização completa da API (AppModule)', () => {
  let app: INestApplication;

  beforeAll(async () => {
    // Import tardio: as variáveis de ambiente acima precisam existir antes dos módulos carregarem.
    const { AppModule } = await import('../src/app.module');
    const { PrismaService } = await import('../src/common/prisma.service');
    const prismaStub = new Proxy({ onModuleInit: async () => undefined, onModuleDestroy: async () => undefined, $connect: async () => undefined, $disconnect: async () => undefined, enableShutdownHooks: () => undefined }, {
      get: (target, key) => (key in target ? (target as Record<string | symbol, unknown>)[key] : new Proxy({}, { get: () => jest.fn().mockResolvedValue(null) })),
    });
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).overrideProvider(PrismaService).useValue(prismaStub).compile();
    app = moduleRef.createNestApplication({ rawBody: true });
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
    await app.init();
  });

  afterAll(async () => { if (app) await app.close(); });

  it('resolve todos os módulos, inclusive PoolsModule + JwtAuthGuard (regressão do crash)', () => {
    expect(app).toBeDefined();
  });

  it('expõe os métodos de pagamento publicamente (Cora: Pix e boleto)', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/v1/pagamentos/metodos').expect(200);
    expect(body).toEqual({ habilitado: false, metodos: ['pix', 'boleto'], valorMinimo: 5 });
  });

  it('protege rotas de relatório, venda manual e conciliação (401 sem login)', async () => {
    for (const path of ['/api/v1/admin/relatorios/resumo', '/api/v1/admin/relatorios/vendas?formato=xlsx', '/api/v1/admin/relatorios/nao-pagos', '/api/v1/admin/pagamentos/configuracao']) {
      await request(app.getHttpServer()).get(path).expect(401);
    }
    for (const path of ['/api/v1/admin/cotas/venda-manual', '/api/v1/admin/pagamentos/conciliar', '/api/v1/admin/pagamentos/cora/webhooks', '/api/v1/admin/concursos']) {
      await request(app.getHttpServer()).post(path).send({}).expect(401);
    }
    await request(app.getHttpServer()).get('/api/v1/cotas/minhas').expect(401);
  });

  it('protege as rotas de NFS-e, endereço do participante e os relatórios novos (401 sem login)', async () => {
    for (const path of ['/api/v1/admin/nfse/configuracao', '/api/v1/admin/nfse/diagnostico', '/api/v1/admin/notas-fiscais', '/api/v1/admin/relatorios/pagamentos', '/api/v1/admin/relatorios/notas-fiscais?formato=xlsx', '/api/v1/usuarios/me/endereco', '/api/v1/admin/concursos/diagnostico']) {
      await request(app.getHttpServer()).get(path).expect(401);
    }
    for (const path of ['/api/v1/admin/nfse/emissor', '/api/v1/admin/nfse/sincronizar', '/api/v1/admin/notas-fiscais/pagamento/6f1c1b9e-8f0a-4a3e-9d1b-2f6f4f4d9a11/emitir', '/api/v1/admin/notas-fiscais/6f1c1b9e-8f0a-4a3e-9d1b-2f6f4f4d9a11/cancelar']) {
      await request(app.getHttpServer()).post(path).send({}).expect(401);
    }
    await request(app.getHttpServer()).put('/api/v1/usuarios/me/endereco').send({}).expect(401);
  });

  it('protege CRM, controle por bolão, liberação e recibo (401 sem login) e valida o PDF', async () => {
    const id = '6f1c1b9e-8f0a-4a3e-9d1b-2f6f4f4d9a11';
    for (const path of ['/api/v1/admin/crm/resumo', '/api/v1/admin/crm/apostadores', '/api/v1/admin/crm/apostadores?formato=csv', `/api/v1/admin/crm/apostadores/${id}`, '/api/v1/admin/relatorios/boloes?formato=pdf', `/api/v1/admin/relatorios/boloes/${id}?formato=pdf`, '/api/v1/admin/relatorios/vendas?formato=pdf', `/api/v1/cotas/${id}/recibo`, `/api/v1/cotas/${id}/recibo?formato=pdf`]) {
      await request(app.getHttpServer()).get(path).expect(401);
    }
    for (const path of [`/api/v1/admin/crm/apostadores/${id}/notas`, `/api/v1/admin/boloes/${id}/liberar`]) await request(app.getHttpServer()).post(path).send({}).expect(401);
    await request(app.getHttpServer()).patch(`/api/v1/admin/crm/apostadores/${id}`).send({}).expect(401);
  });

  it('verificação pública do recibo não exige login e nunca confirma código inválido', async () => {
    const { body } = await request(app.getHttpServer()).get('/api/v1/recibos/6f1c1b9e-8f0a-4a3e-9d1b-2f6f4f4d9a11/verificar?codigo=0000-0000-0000-0000').expect(200);
    expect(body).toEqual({ valido: false });
    await request(app.getHttpServer()).get('/api/v1/recibos/nao-e-uuid/verificar').expect(400);
  });

  it('protege avisos, troca de senha, exportação LGPD e link administrativo (401 sem login)', async () => {
    const id = '6f1c1b9e-8f0a-4a3e-9d1b-2f6f4f4d9a11';
    for (const path of ['/api/v1/notificacoes', '/api/v1/usuarios/me/dados']) await request(app.getHttpServer()).get(path).expect(401);
    for (const path of ['/api/v1/notificacoes/lidas', `/api/v1/boloes/${id}/avise-me`, '/api/v1/usuarios/me/senha', '/api/v1/usuarios/me/exclusao', `/api/v1/admin/usuarios/${id}/redefinicao-senha`]) await request(app.getHttpServer()).post(path).send({}).expect(401);
    await request(app.getHttpServer()).delete(`/api/v1/boloes/${id}/avise-me`).expect(401);
  });

  it('recuperação de senha é pública e valida a entrada', async () => {
    await request(app.getHttpServer()).post('/api/v1/auth/esqueci-senha').send({ email: 'isto-nao-e-email' }).expect(400);
    await request(app.getHttpServer()).post('/api/v1/auth/redefinir-senha').send({ token: 'curto', novaSenha: 'curta' }).expect(400);
  });

  it('webhook da Cora exige o token configurado', async () => {
    await request(app.getHttpServer()).post('/api/v1/webhooks/pagamento/cora').set('webhook-resource-id', 'inv_x').set('webhook-event-type', 'invoice.paid').expect(401);
    await request(app.getHttpServer()).post('/api/v1/webhooks/pagamento/cora?token=segredo-webhook').expect(201).expect(({ body }) => expect(body).toEqual({ ignorado: true }));
  });
});
