import { bestHits, resultMessage, ResultAnnouncer, TIPO_RESULTADO } from './result-announcer';

describe('aviso automático de resultado para os cotistas', () => {
  it('conta o melhor jogo (Mega-Sena 3085: 10 27 29 37 39 59)', () => {
    const drawn = [10, 59, 27, 37, 39, 29];
    expect(bestHits([[7, 15, 17, 19, 29, 50], [1, 16, 31, 33, 42, 50], [2, 3, 29, 35, 52, 53], [22, 25, 26, 29, 37, 50]], drawn)).toBe(2);
    expect(bestHits([], drawn)).toBe(0);
    expect(bestHits([[1, 2, 3]], [9], [1, 2])).toBe(2);
  });
  it('mensagem com os números sorteados, os acertos e o X', () => {
    const text = resultMessage({ modalidade: 'megasena', numeroConcurso: 3085, grupo: 'BL Oficial', drawn: [10, 59, 27, 37, 39, 29], best: 2, jogos: 4 });
    expect(text.titulo).toBe('Saiu o resultado: Mega-Sena 3085');
    expect(text.mensagem).toBe('Números sorteados: 10 · 59 · 27 · 37 · 39 · 29. No seu bolão (BL Oficial), o melhor jogo de 4 fez 2 acertos. Toque para ver seus jogos com os acertos marcados com X.');
  });
  it('avisa cada cotista uma vez por bolão, mesmo com várias cotas e várias rodadas', async () => {
    const created: any[] = [];
    const prisma: any = {
      resultado: { findMany: jest.fn(async () => [{ concursoId: 'c1', numerosSorteados: [1, 2, 3, 4, 5, 6], numerosSegundoSorteio: [] }]) },
      notificacao: { findMany: jest.fn(async () => created.map((item) => ({ usuarioId: item.usuarioId, payload: item.payload }))) },
      bolao: { findMany: jest.fn(async () => [{ id: 'b1', numerosApostados: [], grupo: { nome: 'BL' }, concurso: { modalidade: 'megasena', numeroConcurso: 10 }, jogos: [{ numeros: [1, 2, 9, 10, 11, 12] }], cotas: [{ compradorId: 'u1' }, { compradorId: 'u1' }, { compradorId: 'u2' }] }]) },
    };
    const notifications: any = { notify: jest.fn(async (usuarioId: string, tipo: string, payload: any) => { created.push({ usuarioId, tipo, payload }); }) };
    const announcer = new ResultAnnouncer(prisma, notifications);
    expect(await announcer.announce()).toBe(2);
    expect(created.map((item) => item.usuarioId)).toEqual(['u1', 'u2']);
    expect(created[0]).toMatchObject({ tipo: TIPO_RESULTADO, payload: { bolaoId: 'b1', link: '/boloes/b1', acertos: 2, chave: 'resultado:b1' } });
    expect(await announcer.announce()).toBe(0);
  });
  it('só olha bolões não cancelados e cotas vendidas', async () => {
    const prisma: any = {
      resultado: { findMany: jest.fn(async () => [{ concursoId: 'c1', numerosSorteados: [1], numerosSegundoSorteio: [] }]) },
      notificacao: { findMany: jest.fn(async () => []) },
      bolao: { findMany: jest.fn(async () => []) },
    };
    await new ResultAnnouncer(prisma, { notify: jest.fn() } as any).announce();
    expect(prisma.bolao.findMany.mock.calls[0][0].where).toEqual({ concursoId: 'c1', status: { not: 'cancelado' } });
    expect(prisma.bolao.findMany.mock.calls[0][0].select.cotas.where).toEqual({ status: { in: ['paga', 'registrada', 'apurada', 'premiada'] } });
  });
});
