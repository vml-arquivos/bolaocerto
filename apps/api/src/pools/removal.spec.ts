import { PoolsService } from './pools.service';
import { assessPoolDeletion } from './pool-deletion';
const admin = { id: 'admin', email: 'fixture@example.invalid', papel: 'admin' as const };
const past = new Date(Date.now() - 3600_000);
const future = new Date(Date.now() + 3600_000);
type ShareRow = { id: string; status: string; expiraReservaEm: Date | null; mandato: { id: string } | null; comissao: { status: string } | null; pagamento: { id: string; status: string; notaFiscal: { id: string; status: string } | null } | null };
const share = (overrides: Partial<ShareRow> = {}): ShareRow => ({ id: 's1', status: 'cancelada', expiraReservaEm: past, mandato: { id: 'm1' }, comissao: null, pagamento: { id: 'p1', status: 'pendente', notaFiscal: null }, ...overrides });

function setup(overrides: object = {}, shares: ShareRow[] = [], attachments: Array<{ id: string; caminho: string }> = []) {
  const events: string[] = [];
  const row = { id: 'pool', status: 'rascunho', cotasVendidas: 0, registradoEm: null, comprovanteUrl: null, codigoBilhete: null, ...overrides };
  const del = (name: string) => jest.fn(async () => { events.push(name); return { count: 1 }; });
  const tx: any = {
    $queryRaw: jest.fn(async () => { events.push('lock'); }),
    bolao: { findUnique: jest.fn(async () => { events.push('read'); return row; }), delete: jest.fn(async () => { events.push('delete'); }) },
    cota: { findMany: jest.fn(async () => shares), deleteMany: del('cotas') },
    anexo: { findMany: jest.fn(async () => attachments), deleteMany: del('anexos') },
    pagamento: { deleteMany: del('pagamentos') }, notaFiscal: { deleteMany: del('notas') }, comissao: { deleteMany: del('comissoes') }, mandato: { deleteMany: del('mandatos') },
    comunicado: { updateMany: del('comunicados') },
  };
  const audit: any = { record: jest.fn(async () => { events.push('audit'); }) };
  const storage: any = { remove: jest.fn(async () => undefined) };
  const prisma: any = { $transaction: (fn: any) => fn(tx), ...tx };
  const service = new PoolsService(prisma, audit, undefined, undefined, undefined, storage);
  return { service, tx, events, audit, storage };
}

describe('Excluir bolão sem dinheiro de verdade', () => {
  it('bolão vazio: trava, relê, audita e exclui', async () => {
    const { service, events } = setup();
    expect(await service.removeUnused('pool', admin)).toMatchObject({ id: 'pool', excluido: true });
    expect(events).toEqual(['lock', 'read', 'anexos', 'comunicados', 'audit', 'delete']);
  });

  it('bolão de teste com reserva vencida e anexo: pede confirmação e depois apaga tudo na ordem certa', async () => {
    const { service, tx, events, storage } = setup({ status: 'fechado' }, [share()], [{ id: 'a1', caminho: 'x/a1.pdf' }]);
    await expect(service.removeUnused('pool', admin)).rejects.toThrow(/Confirme a exclusão/);
    expect(tx.bolao.delete).not.toHaveBeenCalled();
    const done = await service.removeUnused('pool', admin, true);
    expect(done).toMatchObject({ excluido: true, apagado: { cotas: 1, pagamentos: 1, anexos: 1 } });
    expect(events.slice(-9)).toEqual(['notas', 'comissoes', 'mandatos', 'pagamentos', 'anexos', 'cotas', 'comunicados', 'audit', 'delete']);
    expect(storage.remove).toHaveBeenCalledWith('x/a1.pdf');
  });

  it('bolão registrado sem venda pode ser apagado com confirmação', async () => {
    const { service } = setup({ status: 'registrado', registradoEm: past, codigoBilhete: 'ABC' });
    await expect(service.removeUnused('pool', admin)).rejects.toThrow(/registrado/);
    await expect(service.removeUnused('pool', admin, true)).resolves.toMatchObject({ excluido: true });
  });

  it.each([
    ['cota paga', share({ status: 'paga', pagamento: { id: 'p', status: 'confirmado', notaFiscal: null } })],
    ['pagamento confirmado', share({ pagamento: { id: 'p', status: 'confirmado', notaFiscal: null } })],
    ['estorno', share({ status: 'estornada', pagamento: { id: 'p', status: 'estornado', notaFiscal: null } })],
    ['comissão paga', share({ comissao: { status: 'paga' } })],
    ['nota emitida', share({ pagamento: { id: 'p', status: 'pendente', notaFiscal: { id: 'n', status: 'emitida' } } })],
    ['reserva ainda valendo', share({ status: 'reservada', expiraReservaEm: future })],
  ])('nunca apaga: %s (mesmo com forçar)', async (_name, row) => {
    const { service, tx } = setup({}, [row]);
    await expect(service.removeUnused('pool', admin, true)).rejects.toThrow(/Não dá para excluir/);
    expect(tx.bolao.delete).not.toHaveBeenCalled();
    expect(tx.cota.deleteMany).not.toHaveBeenCalled();
  });

  it('reserva vencida que ainda aparece como reservada não bloqueia', async () => {
    const { service } = setup({}, [share({ status: 'reservada', expiraReservaEm: past })]);
    await expect(service.removeUnused('pool', admin, true)).resolves.toMatchObject({ excluido: true });
  });

  it('contador antigo de cotas vendidas não impede a exclusão', async () => {
    const { service } = setup({ cotasVendidas: 3 });
    await expect(service.removeUnused('pool', admin)).resolves.toMatchObject({ excluido: true });
  });

  it('afiliado nunca exclui', async () => {
    const { service, events } = setup();
    await expect(service.removeUnused('pool', { ...admin, papel: 'afiliado' })).rejects.toThrow(/administradores/);
    await expect(service.previewRemoval('pool', { ...admin, papel: 'afiliado' })).rejects.toThrow(/administradores/);
    expect(events).toEqual([]);
  });

  it('prévia mostra o que será apagado', async () => {
    const { service } = setup({}, [share()], [{ id: 'a1', caminho: 'k' }]);
    expect(await service.previewRemoval('pool', admin)).toMatchObject({ podeExcluir: true, exigeConfirmacao: true, resumo: { cotas: 1, pagamentos: 1, anexos: 1 } });
  });

  it('cancelar continua bloqueado quando há reserva ou pagamento ativo', async () => {
    const { service, tx } = setup({ status: 'aberto' });
    tx.cota.count = jest.fn(async () => 1); tx.bolao.update = jest.fn();
    await expect(service.cancel('pool', admin)).rejects.toThrow(/ativos/);
    expect(tx.bolao.update).not.toHaveBeenCalled();
  });
});

describe('assessPoolDeletion', () => {
  it('sem nada: pode e não pede confirmação', () => {
    expect(assessPoolDeletion({ status: 'rascunho', registradoEm: null, comprovanteUrl: null, codigoBilhete: null, anexos: 0, cotas: [] })).toMatchObject({ podeExcluir: true, exigeConfirmacao: false });
  });
});

describe('Trocar o concurso de um bolão sem venda real', () => {
  const target = (extra: object = {}) => ({ id: 'c2', modalidade: 'megasena', status: 'aberto', cutoffAt: future, resultado: null, ...extra });
  function moveSetup(poolExtra: object = {}, shares: ShareRow[] = [], contest: object | null = target()) {
    const ctx = setup({ status: 'fechado', concursoId: 'c1', concurso: { numeroConcurso: 1, modalidade: 'megasena' }, ...poolExtra }, shares);
    ctx.tx.concurso = { findUnique: jest.fn(async () => contest) };
    ctx.tx.bolao.update = jest.fn(async ({ data }: any) => ({ status: data.status ?? 'aberto' }));
    return ctx;
  }
  it('passa o bolão fechado para o novo concurso e volta para rascunho', async () => {
    const { service, tx } = moveSetup({}, [share()]);
    expect(await service.moveToContest('pool', 'c2', admin)).toEqual({ id: 'pool', concursoId: 'c2', status: 'rascunho' });
    expect(tx.bolao.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ concursoId: 'c2', vendaInicioEm: null, vendaFimEm: null }) }));
  });
  it.each([
    ['cota paga', moveSetup({}, [share({ status: 'paga', pagamento: { id: 'p', status: 'confirmado', notaFiscal: null } })])],
    ['bolão registrado', moveSetup({ registradoEm: past }, [])],
    ['outra modalidade', moveSetup({}, [], target({ modalidade: 'quina' }))],
    ['concurso já fechado', moveSetup({}, [], target({ cutoffAt: past }))],
    ['concurso inexistente', moveSetup({}, [], null)],
  ])('recusa: %s', async (_name, ctx) => {
    await expect(ctx.service.moveToContest('pool', 'c2', admin)).rejects.toThrow();
    expect(ctx.tx.bolao.update).not.toHaveBeenCalled();
  });
});
