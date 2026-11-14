import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { GROUP_WHATSAPP_PREFIX, HomeService, safeInstagramLink } from './home.service';

function setup(store: Record<string, string> = {}) {
  const prisma: any = {
    configuracaoSistema: {
      findUnique: jest.fn(async ({ where }: any) => (where.chave in store ? { chave: where.chave, valor: store[where.chave] } : null)),
      findMany: jest.fn(async ({ where }: any) => where.chave.in.filter((key: string) => key in store).map((key: string) => ({ chave: key, valor: store[key] }))),
      upsert: jest.fn(async ({ where, create }: any) => { store[where.chave] = create.valor; }),
      deleteMany: jest.fn(async ({ where }: any) => { delete store[where.chave]; }),
    },
    grupo: {
      findUnique: jest.fn(async ({ where }: any) => (where.id === 'g1' ? { id: 'g1', nome: 'Grupo do Ana', afiliado: { usuarioId: 'ana' } } : null)),
      findMany: jest.fn(async () => [{ id: 'g1', nome: 'Grupo do Ana', afiliadoId: 'af-ana' }, { id: 'g2', nome: 'BL Oficial', afiliadoId: null }]),
    },
    usuario: { findUnique: jest.fn(async ({ where }: any) => (where.id === 'cliente' ? { indicadoPorAfiliadoId: 'af-ana' } : null)) },
    afiliado: { findUnique: jest.fn(async ({ where }: any) => (where.usuarioId === 'ana' || where.id === 'af-ana' ? { id: 'af-ana', usuarioId: 'ana', usuario: { nome: 'Ana Souza' } } : null)) },
  };
  return { service: new HomeService(prisma, { record: jest.fn() } as any), store };
}

describe('Comunidade: WhatsApp do grupo e Instagram', () => {
  it('Instagram só aceita o perfil no instagram.com', () => {
    expect(safeInstagramLink('https://www.instagram.com/bolaolivre')).toBe('https://www.instagram.com/bolaolivre');
    expect(safeInstagramLink('https://instagram.com/')).toBe('');
    expect(safeInstagramLink('http://www.instagram.com/x')).toBe('');
    expect(safeInstagramLink('https://evil.com/instagram.com')).toBe('');
  });

  it('salva o Instagram junto e, sem o campo, mantém o que estava', async () => {
    const { service } = setup();
    await service.saveCommunity({ comunidade: 'https://chat.whatsapp.com/abc', grupo: '', instagram: 'https://www.instagram.com/bolaolivre' }, 'adm');
    expect((await service.getCommunity()).instagram).toBe('https://www.instagram.com/bolaolivre');
    await service.saveCommunity({ comunidade: 'https://chat.whatsapp.com/abc', grupo: '' }, 'adm');
    expect((await service.getCommunity()).instagram).toBe('https://www.instagram.com/bolaolivre');
    await expect(service.saveCommunity({ instagram: 'https://tiktok.com/x' }, 'adm')).rejects.toBeInstanceOf(BadRequestException);
  });

  it('link do WhatsApp do grupo: só o afiliado dono ou a equipe; quem é do grupo vê', async () => {
    const { service, store } = setup();
    await expect(service.saveGroupWhatsapp('g1', 'https://chat.whatsapp.com/xyz', { id: 'outro', papel: 'afiliado' })).rejects.toBeInstanceOf(ForbiddenException);
    await expect(service.saveGroupWhatsapp('g1', 'https://site.com/x', { id: 'ana', papel: 'afiliado' })).rejects.toBeInstanceOf(BadRequestException);
    await service.saveGroupWhatsapp('g1', 'https://chat.whatsapp.com/xyz', { id: 'ana', papel: 'afiliado' });
    expect(store[`${GROUP_WHATSAPP_PREFIX}g1`]).toBe('https://chat.whatsapp.com/xyz');
    expect(await service.myGroupsWhatsapp('cliente')).toEqual({ grupos: [{ grupoId: 'g1', nome: 'Grupo do Ana', link: 'https://chat.whatsapp.com/xyz' }], afiliado: null });
    await service.saveGroupWhatsapp('g1', '', { id: 'adm', papel: 'admin' });
    expect(store[`${GROUP_WHATSAPP_PREFIX}g1`]).toBeUndefined();
  });

  it('página do afiliado: ele salva grupo, comunidade e Instagram; os clientes dele veem', async () => {
    const { service, store } = setup();
    await expect(service.saveAffiliateLinks('ana', { instagram: 'https://site.com/x' })).rejects.toBeInstanceOf(BadRequestException);
    await expect(service.saveAffiliateLinks('ana', { grupo: 'https://evil.com/x' })).rejects.toBeInstanceOf(BadRequestException);
    await service.saveAffiliateLinks('ana', { grupo: 'https://chat.whatsapp.com/GrupoAna', comunidade: '', instagram: 'https://www.instagram.com/ana' });
    expect(await service.getAffiliateLinks('ana')).toEqual({ grupo: 'https://chat.whatsapp.com/GrupoAna', comunidade: '', instagram: 'https://www.instagram.com/ana' });
    expect((await service.myGroupsWhatsapp('cliente')).afiliado).toEqual({ nome: 'Ana', grupo: 'https://chat.whatsapp.com/GrupoAna', comunidade: '', instagram: 'https://www.instagram.com/ana' });
    expect((await service.myGroupsWhatsapp('ana')).afiliado).toBeNull();
    await service.saveAffiliateLinks('ana', {});
    expect(Object.keys(store).some((key) => key.startsWith('afiliado.links.'))).toBe(false);
  });
});
