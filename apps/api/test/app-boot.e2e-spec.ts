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

  it('webhook da Cora exige o token configurado', async () => {
    await request(app.getHttpServer()).post('/api/v1/webhooks/pagamento/cora').set('webhook-resource-id', 'inv_x').set('webhook-event-type', 'invoice.paid').expect(401);
    await request(app.getHttpServer()).post('/api/v1/webhooks/pagamento/cora?token=segredo-webhook').expect(201).expect(({ body }) => expect(body).toEqual({ ignorado: true }));
  });
});
