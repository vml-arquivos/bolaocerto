import {
  buildCaixaSources,
  CaixaFetchError,
  CaixaSourceHealth,
  explainCaixaFailure,
  fetchCaixaContest,
  normalizeCaixaContestPayload,
  resolveCaixaTimeout,
} from '@bolaocerto/shared-types';

type Reply = { status?: number; body?: string; throws?: unknown };

function fakeFetch(replies: Reply[]) {
  const calls: Array<{ url: string; headers: Record<string, string> }> = [];
  const impl = async (url: string, init: { headers?: Record<string, string> }) => {
    calls.push({ url, headers: init.headers ?? {} });
    const reply = replies[Math.min(calls.length - 1, replies.length - 1)]!;
    if (reply.throws) throw reply.throws;
    const status = reply.status ?? 200;
    return { ok: status >= 200 && status < 300, status, headers: { get: () => null }, text: async () => reply.body ?? '' };
  };
  return { impl, calls };
}

const official = JSON.stringify({
  numero: 2900,
  dataApuracao: '17/10/2026',
  numeroConcursoProximo: 2901,
  dataProximoConcurso: '20/10/2026',
  acumulado: false,
  listaDezenas: ['04', '06', '13', '21', '26', '28'],
  dezenasSorteadasOrdemSorteio: ['26', '21', '13', '04', '06', '28'],
  valorEstimadoProximoConcurso: 3500000,
  listaRateioPremio: [{ faixa: 1, descricaoFaixa: '6 acertos', numeroDeGanhadores: 1, valorPremio: 1000 }],
});

const mirror = JSON.stringify({
  loteria: 'megasena',
  concurso: 2900,
  data: '17/10/2026',
  dezenasOrdemSorteio: ['26', '21', '13', '04', '06', '28'],
  dezenas: ['04', '06', '13', '21', '26', '28'],
  premiacoes: [{ descricao: '6 acertos', faixa: 1, ganhadores: 1, valorPremio: 1000 }],
  acumulou: false,
  proximoConcurso: 2901,
  dataProximoConcurso: '20/10/2026',
  valorEstimadoProximoConcurso: 3500000,
});

const opts = { retryDelayMs: 1, timeoutMs: 500 };

describe('buildCaixaSources / resolveCaixaTimeout', () => {
  it('usa a URL oficial por padrão e remove a barra final', () => {
    expect(buildCaixaSources({})).toEqual([{ kind: 'caixa', base: 'https://servicebus2.caixa.gov.br/portaldeloterias/api', template: 'https://servicebus2.caixa.gov.br/portaldeloterias/api/{modalidade}' }]);
    expect(buildCaixaSources({ CAIXA_API_BASE_URL: 'https://x.test/api/' })[0]?.template).toBe('https://x.test/api/{modalidade}');
  });

  it('aceita várias fontes alternativas e o modelo com {modalidade}', () => {
    const sources = buildCaixaSources({ CAIXA_FALLBACK_BASE_URL: 'https://a.test/api/, https://b.test/{modalidade}/ultimo' });
    expect(sources.map((source) => source.kind)).toEqual(['caixa', 'fallback', 'fallback']);
    expect(sources[1]?.template).toBe('https://a.test/api/{modalidade}/latest');
    expect(sources[2]?.template).toBe('https://b.test/{modalidade}/ultimo');
  });

  it('limita e valida o timeout', () => {
    expect(resolveCaixaTimeout(undefined)).toBe(15000);
    expect(resolveCaixaTimeout('abc')).toBe(15000);
    expect(resolveCaixaTimeout('8000')).toBe(8000);
    expect(resolveCaixaTimeout('999999')).toBe(60000);
  });
});

describe('normalizeCaixaContestPayload com formato de espelho', () => {
  it('normaliza o formato alternativo para o formato interno', () => {
    const payload = normalizeCaixaContestPayload(JSON.parse(mirror));
    expect(payload).toMatchObject({ numero: 2900, numeroConcursoProximo: 2901, dataApuracao: '17/10/2026', dataProximoConcurso: '20/10/2026', acumulado: false });
    expect(payload.listaDezenas).toEqual(['04', '06', '13', '21', '26', '28']);
    expect(payload.dezenasSorteadasOrdemSorteio).toEqual(['26', '21', '13', '04', '06', '28']);
    expect(payload.listaRateioPremio?.[0]).toMatchObject({ descricaoFaixa: '6 acertos', numeroDeGanhadores: 1, valorPremio: 1000 });
  });

  it('mantém o formato oficial inalterado', () => {
    const payload = normalizeCaixaContestPayload(JSON.parse(official));
    expect(payload.numero).toBe(2900);
    expect(payload.listaRateioPremio?.[0]?.numeroDeGanhadores).toBe(1);
  });
});

describe('fetchCaixaContest', () => {
  const sources = buildCaixaSources({ CAIXA_FALLBACK_BASE_URL: 'https://mirror.test/api' });

  it('envia cabeçalhos de navegador à CAIXA e retorna a fonte caixa', async () => {
    const { impl, calls } = fakeFetch([{ body: official }]);
    const result = await fetchCaixaContest('megasena', sources, { ...opts, fetchImpl: impl });
    expect(result.source).toBe('caixa');
    expect(result.payload.numero).toBe(2900);
    expect(calls[0]?.url).toBe('https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena');
    expect(calls[0]?.headers['user-agent']).toMatch(/Mozilla/);
    expect(calls[0]?.headers.referer).toBe('https://loterias.caixa.gov.br/');
  });

  it('cai para a fonte alternativa quando a CAIXA responde 403 (sem repetir o 403)', async () => {
    const { impl, calls } = fakeFetch([{ status: 403, body: 'Azion - Default error page' }, { body: mirror }]);
    const result = await fetchCaixaContest('megasena', sources, { ...opts, fetchImpl: impl });
    expect(result.source).toBe('fallback');
    expect(calls).toHaveLength(2);
    expect(calls[1]?.url).toBe('https://mirror.test/api/megasena/latest');
    expect(result.attempts[0]).toMatchObject({ ok: false, status: 403, retryable: false });
    expect(result.attempts[0]?.hint).toMatch(/Azion/);
  });

  it('repete em erro 5xx e conclui quando a CAIXA volta', async () => {
    const { impl, calls } = fakeFetch([{ status: 503 }, { body: official }]);
    const result = await fetchCaixaContest('quina', sources, { ...opts, fetchImpl: impl });
    expect(result.source).toBe('caixa');
    expect(calls).toHaveLength(2);
  });

  it('classifica erro de certificado TLS sem sugerir desativar a verificação', async () => {
    const error = Object.assign(new TypeError('fetch failed'), { cause: Object.assign(new Error('unable to verify the first certificate'), { code: 'UNABLE_TO_VERIFY_LEAF_SIGNATURE' }) });
    const { impl } = fakeFetch([{ throws: error }]);
    const only = buildCaixaSources({});
    await expect(fetchCaixaContest('megasena', only, { ...opts, retries: 0, fetchImpl: impl })).rejects.toMatchObject({ name: 'CaixaFetchError' });
    try {
      await fetchCaixaContest('megasena', only, { ...opts, retries: 0, fetchImpl: impl });
    } catch (caught) {
      const attempt = (caught as CaixaFetchError).attempts[0]!;
      expect(attempt.code).toBe('UNABLE_TO_VERIFY_LEAF_SIGNATURE');
      expect(attempt.hint).toMatch(/NODE_EXTRA_CA_CERTS/);
      expect(attempt.hint).toMatch(/não desative/);
    }
  });

  it('trata resposta que não é JSON (página de bloqueio) como falha explicada', async () => {
    const { impl } = fakeFetch([{ body: '<html>Acesso negado</html>' }]);
    const only = buildCaixaSources({});
    await expect(fetchCaixaContest('megasena', only, { ...opts, fetchImpl: impl })).rejects.toThrow(/não é JSON/);
  });

  it('esgota o tempo e orienta o ajuste do timeout', async () => {
    const abort = Object.assign(new Error('aborted'), { name: 'AbortError' });
    const { impl } = fakeFetch([{ throws: abort }]);
    const only = buildCaixaSources({});
    await expect(fetchCaixaContest('megasena', only, { ...opts, retries: 0, fetchImpl: impl })).rejects.toThrow(/CAIXA_API_TIMEOUT_MS/);
  });

  it('pula uma fonte em descanso nos próximos pedidos, mas tenta todas se todas estiverem em descanso', async () => {
    const health = new CaixaSourceHealth(60_000);
    const first = fakeFetch([{ status: 403 }, { body: mirror }]);
    await fetchCaixaContest('megasena', sources, { ...opts, fetchImpl: first.impl, health });
    const second = fakeFetch([{ body: mirror }]);
    const result = await fetchCaixaContest('lotofacil', sources, { ...opts, fetchImpl: second.impl, health });
    expect(second.calls).toHaveLength(1);
    expect(second.calls[0]?.url).toContain('mirror.test');
    expect(result.attempts[0]).toMatchObject({ skipped: true });

    const downAll = new CaixaSourceHealth(60_000);
    for (const source of sources) downAll.markDown(source.base);
    const third = fakeFetch([{ body: official }]);
    const retried = await fetchCaixaContest('quina', sources, { ...opts, fetchImpl: third.impl, health: downAll });
    expect(retried.source).toBe('caixa');
  });

  it('explica DNS e conexão derrubada', () => {
    expect(explainCaixaFailure({ code: 'ENOTFOUND' })).toMatch(/DNS/);
    expect(explainCaixaFailure({ code: 'ECONNRESET' })).toMatch(/bloqueio/);
  });
});
