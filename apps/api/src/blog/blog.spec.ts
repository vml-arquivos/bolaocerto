import { ConflictException, NotFoundException } from '@nestjs/common';
import { BlogService, DEFAULT_SITE_SEO, excerpt, slugify } from './blog.service';

function fakePrisma() {
  const rows = new Map<string, { chave: string; valor: string; atualizadoEm: Date }>();
  return {
    rows,
    configuracaoSistema: {
      findMany: jest.fn(async ({ where }: { where: { chave: { startsWith: string } } }) => [...rows.values()].filter((row) => row.chave.startsWith(where.chave.startsWith))),
      findUnique: jest.fn(async ({ where }: { where: { chave: string } }) => rows.get(where.chave) ?? null),
      upsert: jest.fn(async ({ where, create, update }: { where: { chave: string }; create: { chave: string; valor: string }; update: { valor: string } }) => { const row = rows.get(where.chave); rows.set(where.chave, { chave: where.chave, valor: row ? update.valor : create.valor, atualizadoEm: new Date() }); }),
      create: jest.fn(async ({ data }: { data: { chave: string; valor: string } }) => { rows.set(data.chave, { ...data, atualizadoEm: new Date(Date.now() - 2 * 864e5) }); }),
      deleteMany: jest.fn(async ({ where }: { where: { chave: string | { startsWith: string; notIn: string[] }; atualizadoEm?: { lt: Date } } }) => {
        for (const key of [...rows.keys()]) {
          const row = rows.get(key)!;
          if (typeof where.chave === 'string') { if (key === where.chave) rows.delete(key); continue; }
          if (key.startsWith(where.chave.startsWith) && !where.chave.notIn.includes(key) && (!where.atualizadoEm || row.atualizadoEm < where.atualizadoEm.lt)) rows.delete(key);
        }
      }),
    },
  };
}

const base = { titulo: 'Como funciona a cota de um bolão', conteudo: '## Cota\n\nUma **cota** é a sua parte no bolão.', status: 'publicado' as const };
const author = { id: 'a1', nome: 'Equipe BL' };

describe('BlogService', () => {
  it('cria o endereço do post sem acentos e o resumo a partir do texto', () => {
    expect(slugify('Ação: Mega da Virada 2026!')).toBe('acao-mega-da-virada-2026');
    expect(excerpt('## Título\n\nTexto com **negrito** e [link](https://x.com).', 200)).toBe('Texto com negrito e link.');
  });

  it('publica, lista sem o texto completo e abre pelo endereço; rascunho não aparece', async () => {
    const prisma = fakePrisma();
    const blog = new BlogService(prisma as never);
    const post = await blog.save(base, author);
    expect(post).toMatchObject({ slug: 'como-funciona-a-cota-de-um-bolao', status: 'publicado', resumo: 'Uma cota é a sua parte no bolão.', autor: 'Equipe BL' });
    expect(post.publicadoEm).toBeTruthy();
    await blog.save({ ...base, titulo: 'Rascunho secreto', status: 'rascunho' }, author);
    const list = await blog.listPublished();
    expect(list.map((item) => item.titulo)).toEqual(['Como funciona a cota de um bolão']);
    expect(list[0]).not.toHaveProperty('conteudo');
    expect((await blog.getPublished('como-funciona-a-cota-de-um-bolao')).conteudo).toContain('**cota**');
    await expect(blog.getPublished('rascunho-secreto')).rejects.toThrow(NotFoundException);
    expect(await blog.listForAdmin()).toHaveLength(2);
  });

  it('não deixa dois posts com o mesmo endereço e mantém a data de publicação ao editar', async () => {
    const blog = new BlogService(fakePrisma() as never);
    const first = await blog.save(base, author);
    await expect(blog.save({ ...base, titulo: 'Outro' , slug: first.slug }, author)).rejects.toThrow(ConflictException);
    const edited = await blog.save({ ...base, titulo: 'Título novo' }, author, first.id);
    expect(edited).toMatchObject({ id: first.id, slug: first.slug, titulo: 'Título novo', publicadoEm: first.publicadoEm });
    await expect(blog.save(base, author, '00000000-0000-0000-0000-000000000000')).rejects.toThrow(NotFoundException);
    await blog.remove(first.id);
    expect(await blog.listForAdmin()).toHaveLength(0);
  });

  it('guarda imagem e apaga as que nenhum post usa (sem tocar nas da página inicial)', async () => {
    const prisma = fakePrisma();
    prisma.rows.set('home.img.aaaaaaaaaaaaaaaaaa', { chave: 'home.img.aaaaaaaaaaaaaaaaaa', valor: 'image/png;AA==', atualizadoEm: new Date(0) });
    const blog = new BlogService(prisma as never);
    const png = Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex');
    const used = await blog.saveImage({ buffer: png });
    const orphan = await blog.saveImage({ buffer: png });
    await blog.save({ ...base, imagem: used.url }, author);
    const keys = [...prisma.rows.keys()];
    expect(keys).toContain(`blog.img.${used.url.split('/').pop()}`);
    expect(keys).not.toContain(`blog.img.${orphan.url.split('/').pop()}`);
    expect(keys).toContain('home.img.aaaaaaaaaaaaaaaaaa');
    expect((await blog.readImage(used.url.split('/').pop()!)).mime).toBe('image/png');
    await expect(blog.saveImage({ buffer: Buffer.from('%PDF-1.4') })).rejects.toThrow(/PNG, JPG ou WEBP/);
  });

  it('SEO do site: padrão e salvo', async () => {
    const blog = new BlogService(fakePrisma() as never);
    expect(await blog.getSeo()).toEqual(DEFAULT_SITE_SEO);
    await blog.saveSeo({ titulo: 'Bolão Livre — bolões online', descricao: 'Descrição com mais de cinquenta caracteres para o Google mostrar bem.' });
    expect(await blog.getSeo()).toMatchObject({ titulo: 'Bolão Livre — bolões online', palavrasChave: null });
  });
});
