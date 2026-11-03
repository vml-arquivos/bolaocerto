import { BadRequestException } from '@nestjs/common';
import { DEFAULT_SECOES, isSafeLink, normalizeHomeConfig } from './home.config';
import { HomeService } from './home.service';

const id1 = '11111111-1111-4111-8111-111111111111';
const id2 = '22222222-2222-4222-8222-222222222222';

describe('configuração da página inicial', () => {
  it('sem nada salvo (ou lixo salvo) volta o padrão enxuto', () => {
    expect(normalizeHomeConfig(null)).toEqual({ slides: [], destaques: [], secoes: DEFAULT_SECOES });
    expect(normalizeHomeConfig('{quebrado')).toEqual({ slides: [], destaques: [], secoes: DEFAULT_SECOES });
    expect(DEFAULT_SECOES.resultados).toBe(true);
  });
  it('aceita só links do site ou https; recusa javascript:, data: e //outro-site', () => {
    expect(isSafeLink('/boloes/abc')).toBe(true);
    expect(isSafeLink('https://exemplo.com.br/x')).toBe(true);
    for (const bad of ['javascript:alert(1)', 'data:text/html,x', '//evil.com', 'http://sem-https.com', '/com espaço', 'ftp://x']) expect(isSafeLink(bad)).toBe(false);
  });
  it('limpa o que foi salvo: descarta destaque inválido, corta textos, tira links perigosos e repetidos', () => {
    const cfg = normalizeHomeConfig({
      slides: [
        { id: 'a', tipo: 'bolao', ativo: true, bolaoId: id1, titulo: '' },
        { id: 'b', tipo: 'bolao', ativo: true, titulo: 'sem bolão' },
        { id: 'c', tipo: 'livre', ativo: false, titulo: 'x'.repeat(200), botao: 'Ver', link: 'javascript:alert(1)' },
        { id: 'd', tipo: 'livre', ativo: true, titulo: '' },
      ],
      destaques: [id1, id1, 'nao-e-uuid', id2],
      secoes: { numeros: true, resultados: 'sim' },
    });
    expect(cfg.slides.map((s) => s.id)).toEqual(['a', 'c']);
    expect(cfg.slides[1]!.titulo).toHaveLength(80);
    expect(cfg.slides[1]!.link).toBeUndefined();
    expect(cfg.slides[1]!.ativo).toBe(false);
    expect(cfg.destaques).toEqual([id1, id2]);
    expect(cfg.secoes.numeros).toBe(true);
    expect(cfg.secoes.resultados).toBe(true); // valor inválido volta ao padrão
  });
});

describe('HomeService', () => {
  function setup(rows: any[] = [], pools = 2) {
    const store: Record<string, string> = {};
    const tx: any = { configuracaoSistema: { upsert: jest.fn(async ({ where, create, update }: any) => { store[where.chave] = (store[where.chave] ? update : create).valor; }) } };
    const prisma: any = {
      configuracaoSistema: { findUnique: jest.fn(async ({ where }: any) => (store[where.chave] ? { valor: store[where.chave] } : null)) },
      bolao: { count: jest.fn(async () => pools), findMany: jest.fn(async () => []) },
      resultado: { findMany: jest.fn(async () => rows) },
      $transaction: (fn: any) => fn(tx),
    };
    const audit: any = { record: jest.fn().mockResolvedValue(undefined) };
    return { service: new HomeService(prisma, audit), audit, store, prisma };
  }
  const dto = (extra: any = {}) => ({ slides: [], destaques: [], secoes: { ...DEFAULT_SECOES }, ...extra });

  it('salva, guarda no banco, registra no histórico e devolve igual na leitura pública', async () => {
    const { service, audit } = setup([], 1);
    const saved = await service.save(dto({ destaques: [id1], slides: [{ id: 's1', tipo: 'bolao', ativo: true, bolaoId: id1, titulo: '' }] }) as any, 'admin1');
    expect(saved.destaques).toEqual([id1]);
    expect(audit.record).toHaveBeenCalledWith(expect.anything(), expect.objectContaining({ evento: 'home.atualizada', atorId: 'admin1' }));
    expect((await service.getConfig()).slides[0]!.bolaoId).toBe(id1);
  });
  it('recusa destaque de bolão que não existe, slide livre sem título e botão sem link', async () => {
    await expect(setup([], 1).service.save(dto({ destaques: [id1, id2] }) as any, 'a')).rejects.toBeInstanceOf(BadRequestException);
    await expect(setup().service.save(dto({ slides: [{ id: 's', tipo: 'livre', ativo: true, titulo: '  ' }] }) as any, 'a')).rejects.toThrow(/título/);
    await expect(setup().service.save(dto({ slides: [{ id: 's', tipo: 'livre', ativo: true, titulo: 'Oi', botao: 'Ver' }] }) as any, 'a')).rejects.toThrow(/link/);
    await expect(setup().service.save(dto({ slides: [{ id: 's', tipo: 'bolao', ativo: true, titulo: '' }] }) as any, 'a')).rejects.toThrow(/bolão/);
  });
  it('últimos resultados: até N sorteios por modalidade, mais recente primeiro, na ordem dos jogos', async () => {
    const mk = (modalidade: string, n: number, day: number, numeros = [1, 2, 3]) => ({ numerosSorteados: numeros, numerosSegundoSorteio: [], listaRateioPremio: [{ numeroDeGanhadores: 0, valorPremio: 0 }], concurso: { modalidade, numeroConcurso: n, dataSorteio: new Date(`2026-10-${day}T20:00:00Z`), acumulado: true, nomeEspecial: null } });
    const rows = [mk('quina', 7000, 30), mk('megasena', 3000, 29), mk('megasena', 2999, 26), mk('megasena', 2998, 22), mk('lotofacil', 3800, 28, []), mk('quina', 6999, 25, [5, 6, 7, 8, 9])];
    const { service } = setup(rows);
    const out = await service.latestResults(2);
    expect(out.map((g) => g.modalidade)).toEqual(['megasena', 'quina']); // sem números (lotofacil) não entra; ordem dos jogos
    expect(out[0]!.sorteios.map((s) => s.numeroConcurso)).toEqual([3000, 2999]);
    expect(out[1]!.sorteios).toHaveLength(2);
    expect(out[0]!.sorteios[0]).toMatchObject({ acumulado: true, ganhadores: 0, premio: null });
  });
});
