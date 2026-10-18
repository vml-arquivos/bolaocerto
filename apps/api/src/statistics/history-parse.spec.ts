import { buildCaixaSources, fetchCaixaContest, getLotteryRule, parseHistoricalDraw, resolveSourceUrl } from '@bolaocerto/shared-types';

describe('histórico da CAIXA', () => {
  const mega = getLotteryRule('megasena')!;
  it('monta a URL do concurso na CAIXA e nos espelhos (/latest vira /número)', () => {
    const [caixa, mirror, custom] = buildCaixaSources({ CAIXA_FALLBACK_BASE_URL: 'https://espelho.exemplo/api,https://outro.exemplo/{modalidade}/ultimo' });
    expect(resolveSourceUrl(caixa!, 'megasena')).toBe('https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena');
    expect(resolveSourceUrl(caixa!, 'megasena', 2800)).toBe('https://servicebus2.caixa.gov.br/portaldeloterias/api/megasena/2800');
    expect(resolveSourceUrl(mirror!, 'megasena', 2800)).toBe('https://espelho.exemplo/api/megasena/2800');
    expect(resolveSourceUrl(custom!, 'quina', 10)).toBe('https://outro.exemplo/quina/ultimo/10');
  });

  it('consulta um concurso específico', async () => {
    const urls: string[] = [];
    const fetchImpl = (async (url: string) => { urls.push(url); return { ok: true, status: 200, text: async () => JSON.stringify({ numero: 2800, dataApuracao: '10/09/2025', listaDezenas: ['04', '12', '23', '35', '44', '58'] }) }; }) as any;
    const result = await fetchCaixaContest('megasena', buildCaixaSources({}), { contestNumber: 2800, fetchImpl, retries: 0 });
    expect(urls[0]).toMatch(/megasena\/2800$/);
    expect(parseHistoricalDraw(mega, result.payload, 2800)?.numbers).toEqual([4, 12, 23, 35, 44, 58]);
  });

  it('rejeita resposta de outro concurso, dezenas erradas ou fora do universo', () => {
    const ok = { numero: 10, dataApuracao: '10/09/2025', listaDezenas: ['01', '02', '03', '04', '05', '06'] };
    expect(parseHistoricalDraw(mega, ok, 10)).not.toBeNull();
    expect(parseHistoricalDraw(mega, ok, 11)).toBeNull();
    expect(parseHistoricalDraw(mega, { ...ok, listaDezenas: ['01', '02', '03'] }, 10)).toBeNull();
    expect(parseHistoricalDraw(mega, { ...ok, listaDezenas: ['01', '02', '03', '04', '05', '61'] }, 10)).toBeNull();
    expect(parseHistoricalDraw(mega, { ...ok, listaDezenas: ['01', '01', '03', '04', '05', '06'] }, 10)).toBeNull();
    expect(parseHistoricalDraw(mega, { ...ok, dataApuracao: undefined }, 10)).toBeNull();
  });

  it('Lotomania aceita "00" e Dupla Sena traz o segundo sorteio', () => {
    const loto = getLotteryRule('lotomania')!;
    const twenty = Array.from({ length: 20 }, (_, i) => String(i * 5).padStart(2, '0'));
    expect(parseHistoricalDraw(loto, { numero: 1, dataApuracao: '01/01/2024', listaDezenas: twenty })?.numbers[0]).toBe(0);
    const dupla = getLotteryRule('duplasena')!;
    const draw = parseHistoricalDraw(dupla, { numero: 5, dataApuracao: '01/01/2024', listaDezenas: ['01', '02', '03', '04', '05', '06'], listaDezenasSegundoSorteio: ['10', '11', '12', '13', '14', '15'] }, 5);
    expect(draw?.secondDrawNumbers).toEqual([10, 11, 12, 13, 14, 15]);
  });
});
