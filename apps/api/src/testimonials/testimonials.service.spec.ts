import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { TestimonialsService, publicName } from './testimonials.service';

function setup() {
  const store = new Map<string, string>();
  const prisma: any = {
    configuracaoSistema: {
      findMany: jest.fn(async ({ where }: any) => [...store.entries()].filter(([key]) => key.startsWith(where.chave.startsWith)).map(([chave, valor]) => ({ chave, valor }))),
      upsert: jest.fn(async ({ where, create }: any) => { store.set(where.chave, create.valor); }),
      deleteMany: jest.fn(async ({ where }: any) => { store.delete(where.chave); }),
    },
    usuario: {
      findUnique: jest.fn(async ({ where }: any) => ({ cli: { nome: 'Maria da Silva', indicadoPorAfiliadoId: 'af1' }, out: { nome: 'Outro Cliente', indicadoPorAfiliadoId: null } } as any)[where.id] ?? null),
      findMany: jest.fn(async () => [{ id: 'cli', nome: 'Maria da Silva', email: 'm@x.com' }]),
    },
    cota: { findMany: jest.fn(async () => []) },
    afiliado: {
      findMany: jest.fn(async ({ where }: any) => (where.id.in.includes('af1') ? [{ id: 'af1', codigoAfiliado: 'BL-1', usuario: { nome: 'João Afiliado' } }] : [])),
      findUnique: jest.fn(async ({ where }: any) => (where.usuarioId === 'joao' || where.codigoAfiliado === 'BL-1' ? { id: 'af1' } : null)),
    },
  };
  return { service: new TestimonialsService(prisma, { record: jest.fn() } as any), store };
}
const cli = { id: 'cli', papel: 'cotista' } as any;
const admin = { id: 'adm', papel: 'admin' } as any;

describe('Depoimentos', () => {
  it('nome público: primeiro nome e inicial', () => { expect(publicName('Maria da Silva')).toBe('Maria S.'); expect(publicName('Ana')).toBe('Ana'); });

  it('cotista escreve sobre o BL e sobre o afiliado dele; só aparece depois de aprovado', async () => {
    const { service } = setup();
    const mine = await service.mine(cli);
    expect(mine.destinos.map((item) => item.nome)).toEqual(['Bolão Livre', 'João Afiliado']);
    const sys = await service.save(cli, { texto: 'Muito fácil acompanhar meu bolão.', estrelas: 5 });
    await service.save(cli, { texto: 'O João me explicou tudo.', estrelas: 4, afiliadoId: 'af1', nome: 'Maria' });
    expect((await service.publicList()).items).toHaveLength(0);
    await service.moderate(sys.id, 'aprovado', admin);
    const pub = await service.publicList();
    expect(pub).toMatchObject({ total: 1, media: 5, items: [{ nome: 'Maria S.', estrelas: 5, alvo: 'sistema' }] });
    expect(JSON.stringify(pub)).not.toContain('cli');
    const affiliateView = await service.forAffiliate({ id: 'joao', papel: 'afiliado' } as any);
    expect(affiliateView).toMatchObject({ total: 0, aguardando: 1 });
  });

  it('reescrever volta para aprovação e não duplica; limites e validações', async () => {
    const { service } = setup();
    const first = await service.save(cli, { texto: 'Gostei bastante do sistema.', estrelas: 5 });
    await service.moderate(first.id, 'aprovado', admin);
    const again = await service.save(cli, { texto: 'Gostei bastante, recomendo.', estrelas: 4 });
    expect(again.id).toBe(first.id); expect(again.status).toBe('pendente');
    await expect(service.save(cli, { texto: 'curto', estrelas: 5 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.save(cli, { texto: 'Texto válido aqui.', estrelas: 6 })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.save({ id: 'out', papel: 'cotista' } as any, { texto: 'Quero avaliar este afiliado.', estrelas: 1, afiliadoId: 'af1' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.save(admin, { texto: 'Equipe não escreve.', estrelas: 5 })).rejects.toBeInstanceOf(ForbiddenException);
    const list = await service.adminList('pendente');
    expect(list.contagem).toEqual({ pendente: 1, aprovado: 0, oculto: 0 });
    expect(list.items[0]!.autor).toEqual({ nome: 'Maria da Silva', email: 'm@x.com' });
  });
});
