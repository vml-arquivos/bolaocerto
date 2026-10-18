'use client';
import { useMemo, useState } from 'react';
import { fmtDate, fmtInt, fmtPercent, GameAnalysis, LotteryStats, NumberStat, pad, Probabilities, Suggestions, TierProbability } from '../lib/stats';
import { money } from '../lib/domain';
import { NumberPicker } from './number-picker';

type Tab = 'panorama' | 'numeros' | 'probabilidades' | 'analisar' | 'sugestoes';
const TABS: Array<{ id: Tab; label: string; hint: string }> = [
  { id: 'panorama', label: 'Panorama', hint: 'Resumo do histórico' },
  { id: 'numeros', label: 'Números', hint: 'Frequência e atraso' },
  { id: 'probabilidades', label: 'Probabilidades', hint: 'Matemática exata' },
  { id: 'analisar', label: 'Analisar meu jogo', hint: 'Compare com o histórico' },
  { id: 'sugestoes', label: 'Sugestões', hint: 'Jogos equilibrados' },
];

function Balls({ numbers, small = false, mark }: { numbers: number[]; small?: boolean; mark?: number[] }) {
  return <div className={`st-balls${small ? ' is-small' : ''}`}>{numbers.map((n) => <span key={n} className={`st-ball${mark?.includes(n) ? ' is-mark' : ''}`}>{pad(n)}</span>)}</div>;
}

function Bars({ items, format = (v: number) => `${v.toLocaleString('pt-BR')}%` }: { items: Array<{ label: string; value: number; ref?: number; note?: string }>; format?: (value: number) => string }) {
  const max = Math.max(1, ...items.map((item) => Math.max(item.value, item.ref ?? 0)));
  return <div className="st-bars">{items.map((item) => <div className="st-bar-row" key={item.label}>
    <span className="st-bar-label">{item.label}</span>
    <div className="st-bar-track" title={item.note}>
      <i className="st-bar-fill" style={{ width: `${(item.value / max) * 100}%` }} />
      {item.ref !== undefined && <b className="st-bar-ref" style={{ left: `${(item.ref / max) * 100}%` }} aria-hidden="true" />}
    </div>
    <span className="st-bar-value">{format(item.value)}</span>
  </div>)}</div>;
}

function Kpi({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return <div className="st-kpi"><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div>;
}

function Card({ title, subtitle, children, wide = false }: { title: string; subtitle?: string; children: React.ReactNode; wide?: boolean }) {
  return <section className={`st-card${wide ? ' is-wide' : ''}`}><header><h3>{title}</h3>{subtitle && <p>{subtitle}</p>}</header>{children}</section>;
}

function TierTable({ tiers, label = 'Faixa' }: { tiers: TierProbability[]; label?: string }) {
  return <div className="st-table-wrap"><table className="st-table"><thead><tr><th>{label}</th><th>Chance</th><th>Em porcentagem</th></tr></thead><tbody>
    {tiers.map((tier) => <tr key={tier.hits}><td>{tier.label}</td><td><strong>1 em {fmtInt(tier.oneIn)}</strong></td><td>{fmtPercent(tier.percent)}</td></tr>)}
  </tbody></table></div>;
}

function Chip({ tone, children }: { tone: 'hot' | 'cold' | 'late' | 'ok' | 'warn'; children: React.ReactNode }) {
  return <span className={`st-chip is-${tone}`}>{children}</span>;
}

/* ───────────── Panorama ───────────── */
function Panorama({ stats }: { stats: LotteryStats }) {
  const parityBars = stats.parity.distribution.map((item) => ({ label: `${item.odd} ímp. / ${item.even} par`, value: item.pct, ref: item.theoreticalPct, note: `${item.count} concursos` }));
  const maxHist = Math.max(1, ...stats.sum.histogram.map((bin) => bin.pct));
  const lowestSample = stats.sample.draws < 30;
  return <div className="st-grid">
    {lowestSample && <div className="st-note is-wide">O histórico carregado ainda é pequeno ({stats.sample.draws} sorteios). As estatísticas ficam mais confiáveis conforme o histórico é completado automaticamente.</div>}
    <Card title="Últimos resultados" subtitle="Dezenas sorteadas nos concursos mais recentes" wide>
      <div className="st-results">{stats.ultimosResultados.slice(0, 6).map((result) => <div className="st-result" key={result.concurso}>
        <div><strong>Concurso {result.concurso}</strong><small>{fmtDate(result.data)}{result.acumulado ? ' · acumulou' : ''}</small></div>
        <Balls numbers={result.dezenas} small />
        {result.segundoSorteio.length > 0 && <div><small>2º sorteio</small><Balls numbers={result.segundoSorteio} small /></div>}
      </div>)}
      {stats.ultimosResultados.length === 0 && <p className="st-empty">Os resultados ainda estão sendo importados da CAIXA.</p>}</div>
    </Card>

    {stats.uniformity && <Card title="O sorteio é aleatório?" subtitle="Teste estatístico (qui-quadrado) sobre todas as dezenas">
      <div className={`st-verdict is-${stats.uniformity.conclusion}`}><strong>{stats.uniformity.conclusion === 'consistente' ? 'Compatível com sorteio aleatório' : 'Variação acima do esperado nesta amostra'}</strong><p>{stats.uniformity.explanation}</p></div>
      <small className="st-muted">χ² = {stats.uniformity.chiSquare} · graus de liberdade = {stats.uniformity.df} · p = {stats.uniformity.pValue.toLocaleString('pt-BR')}</small>
    </Card>}

    <Card title="Pares e ímpares" subtitle="% dos sorteios (barra) × esperado pela matemática (marca)">
      <Bars items={parityBars} />
      {stats.parity.mostCommonOdd !== null && <p className="st-insight">Mais comum nesta base: <strong>{stats.parity.mostCommonOdd} ímpares e {stats.rule.draw - stats.parity.mostCommonOdd} pares</strong>.</p>}
    </Card>

    <Card title="Soma das dezenas" subtitle={`Média histórica ${stats.sum.mean?.toLocaleString('pt-BR') ?? '—'} · esperada ${stats.sum.theoreticalMean.toLocaleString('pt-BR')}`}>
      <div className="st-hist" role="img" aria-label="Histograma da soma das dezenas sorteadas">{stats.sum.histogram.map((bin) => <div key={bin.from} className="st-hist-col" title={`${bin.from} a ${bin.to}: ${bin.pct}%`}><i style={{ height: `${(bin.pct / maxHist) * 100}%` }} /><small>{bin.from}</small></div>)}</div>
      {stats.sum.p10 !== null && stats.sum.p90 !== null && <p className="st-insight">80% dos sorteios somam entre <strong>{Math.round(stats.sum.p10)}</strong> e <strong>{Math.round(stats.sum.p90)}</strong>.</p>}
    </Card>

    <Card title="Repetição do concurso anterior" subtitle="Quantas dezenas se repetem de um sorteio para o seguinte">
      <Bars items={stats.repeats.distribution.map((item) => ({ label: `${item.repeated} repetida${item.repeated === 1 ? '' : 's'}`, value: item.pct, note: `${item.count} vezes` }))} />
      <p className="st-insight">Em média <strong>{stats.repeats.avg.toLocaleString('pt-BR')}</strong> dezenas se repetem.</p>
    </Card>

    <Card title="Distribuição pelo volante" subtitle="Média de dezenas por faixa (barra) × esperado (marca)">
      <Bars items={stats.groups.map((group) => ({ label: group.label, value: group.avgPerDraw, ref: group.expectedPerDraw }))} format={(v) => v.toLocaleString('pt-BR')} />
    </Card>

    <Card title="Sequências" subtitle="Números vizinhos no mesmo sorteio (ex.: 23 e 24)">
      <div className="st-kpis"><Kpi label="Sorteios com sequência" value={`${stats.consecutive.drawsWithPairPct.toLocaleString('pt-BR')}%`} /><Kpi label="Pares vizinhos por sorteio" value={stats.consecutive.avgPairs.toLocaleString('pt-BR')} /></div>
    </Card>

    <Card title="Duplas que mais saíram juntas" subtitle="Comparadas com o que o acaso produziria" wide>
      <div className="st-table-wrap"><table className="st-table"><thead><tr><th>Dupla</th><th>Vezes juntas</th><th>Esperado ao acaso</th><th>Relação</th></tr></thead><tbody>
        {stats.pairs.map((pair) => <tr key={`${pair.a}-${pair.b}`}><td><Balls numbers={[pair.a, pair.b]} small /></td><td>{pair.count}</td><td>{pair.expected.toLocaleString('pt-BR')}</td><td>{pair.ratio.toLocaleString('pt-BR')}×</td></tr>)}
      </tbody></table></div>
      <p className="st-muted">Com muitas duplas possíveis, é normal que algumas fiquem bem acima da média só por acaso.</p>
    </Card>
  </div>;
}

/* ───────────── Números ───────────── */
type Metric = 'frequencia' | 'recentes' | 'atraso';
function Numeros({ stats }: { stats: LotteryStats }) {
  const [metric, setMetric] = useState<Metric>('frequencia');
  const [selected, setSelected] = useState<number | null>(null);
  const maxDelay = Math.max(1, ...stats.numbers.map((s) => s.delay));
  const detail = stats.numbers.find((s) => s.number === selected) ?? null;
  const cellStyle = (s: NumberStat): React.CSSProperties => {
    if (metric === 'atraso') return { background: `color-mix(in srgb, var(--warning) ${Math.round((s.delay / maxDelay) * 70)}%, var(--surface-muted))` };
    const z = metric === 'frequencia' ? s.z : s.recentZ;
    const strength = Math.min(Math.abs(z) / 2.5, 1) * 70;
    return { background: `color-mix(in srgb, ${z >= 0 ? 'var(--primary)' : 'var(--warning)'} ${Math.round(strength)}%, var(--surface-muted))` };
  };
  const list = (title: string, hint: string, items: NumberStat[], value: (s: NumberStat) => string) => <Card title={title} subtitle={hint}>
    {items.length === 0 ? <p className="st-empty">Nenhuma dezena se destaca agora.</p> : <ol className="st-rank">{items.slice(0, 8).map((s) => <li key={s.number}><span className="st-ball is-small">{pad(s.number)}</span><span>{value(s)}</span></li>)}</ol>}
  </Card>;
  return <div className="st-grid">
    <Card title="Mapa de calor das dezenas" subtitle="Toque em uma dezena para ver os detalhes" wide>
      <div className="st-segmented" role="tablist" aria-label="Métrica do mapa">
        {([['frequencia', 'Frequência geral'], ['recentes', `Últimos ${stats.sample.recentWindow} concursos`], ['atraso', 'Atraso atual']] as Array<[Metric, string]>).map(([id, label]) => <button key={id} type="button" role="tab" aria-selected={metric === id} className={metric === id ? 'is-on' : ''} onClick={() => setMetric(id)}>{label}</button>)}
      </div>
      <div className="st-heat" style={{ ['--cols' as string]: stats.rule.max - stats.rule.min + 1 <= 31 ? 5 : 10 }}>
        {stats.numbers.map((s) => <button key={s.number} type="button" className={`st-heat-cell${selected === s.number ? ' is-selected' : ''}`} style={cellStyle(s)} onClick={() => setSelected(s.number === selected ? null : s.number)} aria-label={`Dezena ${pad(s.number)}: ${s.count} vezes, atraso ${s.delay}`}>
          <strong>{pad(s.number)}</strong><small>{metric === 'frequencia' ? `${s.count}×` : metric === 'recentes' ? `${s.recentCount}×` : s.delay}</small>
        </button>)}
      </div>
      <div className="st-legend">{metric === 'atraso' ? <><span><i className="is-late" /> maior atraso</span><span><i className="is-neutral" /> saiu há pouco</span></> : <><span><i className="is-hot" /> acima do esperado</span><span><i className="is-neutral" /> normal</span><span><i className="is-cold" /> abaixo do esperado</span></>}</div>
      {detail && <div className="st-detail" role="status">
        <div className="st-detail-head"><span className="st-ball">{pad(detail.number)}</span><div><strong>Dezena {pad(detail.number)}</strong><div className="st-chips">{detail.hot && <Chip tone="hot">em alta</Chip>}{detail.cold && <Chip tone="cold">em baixa</Chip>}{detail.overdue && <Chip tone="late">atrasada</Chip>}{!detail.hot && !detail.cold && !detail.overdue && <Chip tone="ok">dentro do normal</Chip>}</div></div></div>
        <div className="st-kpis">
          <Kpi label="Vezes sorteada" value={fmtInt(detail.count)} hint={`esperado ≈ ${detail.expectedCount.toLocaleString('pt-BR')}`} />
          <Kpi label="Em % dos concursos" value={`${detail.frequencyPct.toLocaleString('pt-BR')}%`} hint={`ao acaso: ${(stats.perNumberProbability * 100).toLocaleString('pt-BR', { maximumFractionDigits: 1 })}%`} />
          <Kpi label="Atraso atual" value={`${detail.delay}`} hint={detail.lastContest ? `saiu no concurso ${detail.lastContest}` : 'ainda não saiu na base'} />
          <Kpi label="Intervalo médio" value={detail.avgInterval ? `${detail.avgInterval.toLocaleString('pt-BR')} concursos` : '—'} hint={`maior atraso: ${detail.maxDelay}`} />
        </div>
      </div>}
    </Card>
    {list('Mais sorteadas', 'Desde o início da base', stats.mostFrequent, (s) => `${s.count} vezes (${s.frequencyPct.toLocaleString('pt-BR')}%)`)}
    {list('Menos sorteadas', 'Desde o início da base', stats.leastFrequent, (s) => `${s.count} vezes (${s.frequencyPct.toLocaleString('pt-BR')}%)`)}
    {list('Em alta', `Acima do esperado nos últimos ${stats.sample.recentWindow} concursos`, stats.hot, (s) => `${s.recentCount} vezes (esperado ${s.recentExpected.toLocaleString('pt-BR')})`)}
    {list('Em baixa', `Abaixo do esperado nos últimos ${stats.sample.recentWindow} concursos`, stats.cold, (s) => `${s.recentCount} vezes (esperado ${s.recentExpected.toLocaleString('pt-BR')})`)}
    {list('Mais atrasadas', 'Concursos sem sair', stats.overdue, (s) => `${s.delay} concursos sem sair`)}
    <div className="st-note is-wide"><strong>Como ler:</strong> “em alta”, “em baixa” e “atrasada” descrevem o passado. Como cada sorteio é independente, uma dezena atrasada <em>não está “devendo” sair</em> e uma dezena em alta não tem mais chance no próximo concurso.</div>
  </div>;
}

/* ───────────── Probabilidades ───────────── */
function Probabilidades({ stats }: { stats: LotteryStats }) {
  const [size, setSize] = useState(stats.rule.betMin);
  const [data, setData] = useState<Probabilities>(stats.probabilidades);
  const [loading, setLoading] = useState(false);
  const sizes: number[] = [];
  for (let k = stats.rule.betMin; k <= stats.rule.betMax; k += 1) sizes.push(k);
  async function change(value: number) {
    setSize(value); setLoading(true);
    try {
      const response = await fetch(`/api/v1/estatisticas/${stats.modalidade}/probabilidades?dezenas=${value}`);
      if (response.ok) setData(await response.json() as Probabilities);
    } finally { setLoading(false); }
  }
  return <div className="st-grid">
    <Card title="Chance de cada prêmio" subtitle={`${stats.nome}: ${stats.rule.draw} dezenas sorteadas entre ${stats.rule.max - stats.rule.min + 1} possíveis`} wide>
      {sizes.length > 1 && <label className="st-field"><span>Quantas dezenas você marca?</span><select value={size} onChange={(event) => void change(Number(event.target.value))}>{sizes.map((k) => <option key={k} value={k}>{k} dezenas</option>)}</select></label>}
      <div className={loading ? 'st-loading' : ''}>
        <p className="st-insight">Um jogo com <strong>{data.dezenas} dezenas</strong> equivale a <strong>{fmtInt(data.jogosSimplesEquivalentes)}</strong> jogo{data.jogosSimplesEquivalentes === 1 ? '' : 's'} simples.</p>
        <TierTable tiers={data.faixas} />
      </div>
      <p className="st-muted">{data.explicacao}</p>
    </Card>
    {data.porTamanho.length > 1 && <Card title="Quanto mais dezenas, maior a chance" subtitle="Chance do prêmio máximo por tamanho de jogo" wide>
      <div className="st-table-wrap"><table className="st-table"><thead><tr><th>Dezenas</th><th>Jogos simples</th><th>Chance do prêmio máximo</th></tr></thead><tbody>
        {data.porTamanho.map((row) => <tr key={row.dezenas}><td>{row.dezenas}</td><td>{fmtInt(row.jogosSimplesEquivalentes)}</td><td><strong>1 em {fmtInt(row.premioMaximo.oneIn)}</strong></td></tr>)}
      </tbody></table></div>
      <p className="st-muted">É por isso que o bolão ajuda: com mais jogos no grupo, cada participante divide o custo e a chance do conjunto aumenta, mas o prêmio também é dividido pelas cotas.</p>
    </Card>}
  </div>;
}

/* ───────────── Analisar ───────────── */
function Analisar({ stats, initial }: { stats: LotteryStats; initial?: number[] }) {
  const [picked, setPicked] = useState<number[]>(initial ?? []);
  const [result, setResult] = useState<GameAnalysis | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const { betMin, betMax, min, max } = stats.rule;
  const toggle = (value: number) => { setResult(null); setPicked((current) => (current.includes(value) ? current.filter((v) => v !== value) : [...current, value].sort((a, b) => a - b))); };
  const ready = picked.length >= betMin && picked.length <= betMax;
  async function analyze() {
    setLoading(true); setError('');
    try {
      const response = await fetch(`/api/v1/estatisticas/${stats.modalidade}/analisar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ numeros: picked }) });
      const body = await response.json() as GameAnalysis & { message?: string | string[] };
      if (!response.ok) setError(Array.isArray(body.message) ? body.message.join(' ') : body.message ?? 'Não foi possível analisar o jogo.');
      else setResult(body);
    } catch { setError('Não foi possível conectar ao serviço.'); } finally { setLoading(false); }
  }
  return <div className="st-grid">
    <Card title="Monte seu jogo" subtitle={betMin === betMax ? `Marque exatamente ${betMin} números` : `Marque de ${betMin} a ${betMax} números`} wide>
      <NumberPicker min={min} max={max} selected={picked} onToggle={toggle} limit={betMax} />
      <div className="st-actions">
        <span className="st-count">{picked.length} marcado{picked.length === 1 ? '' : 's'}{!ready && picked.length > 0 ? ` · faltam ${Math.max(betMin - picked.length, 0)}` : ''}</span>
        <button type="button" className="button button-ghost" onClick={() => { setPicked([]); setResult(null); }} disabled={picked.length === 0}>Limpar</button>
        <button type="button" className="button button-primary" onClick={() => void analyze()} disabled={!ready || loading}>{loading ? 'Analisando…' : 'Analisar jogo'}</button>
      </div>
      {error && <div className="form-message form-error" role="alert">{error}</div>}
    </Card>
    {result && <AnalysisResult stats={stats} result={result} />}
  </div>;
}

function AnalysisResult({ stats, result }: { stats: LotteryStats; result: GameAnalysis }) {
  const top = result.probabilities[0];
  return <>
    <Card title="Seu jogo" subtitle="Chances exatas de cada faixa de prêmio" wide>
      <Balls numbers={result.numbers} />
      {top && <p className="st-insight">Chance de acertar tudo: <strong>1 em {fmtInt(top.oneIn)}</strong> — igual à de qualquer outra combinação de {result.size} dezenas.</p>}
      <TierTable tiers={result.probabilities} />
    </Card>
    <Card title="Características do jogo" subtitle="Comparação com o padrão dos sorteios">
      <ul className="st-facts">
        <li><span>Soma</span><strong>{result.sum.value}</strong><Chip tone={result.sum.typical ? 'ok' : 'warn'}>{result.sum.typical ? 'faixa comum' : 'faixa rara'}</Chip></li>
        <li><span>Ímpares / pares</span><strong>{result.parity.odd} / {result.parity.even}</strong><small>ocorre em {result.parity.theoreticalPct.toLocaleString('pt-BR')}% dos jogos ao acaso{result.parity.historicalPct !== null ? ` · ${result.parity.historicalPct.toLocaleString('pt-BR')}% dos sorteios` : ''}</small></li>
        <li><span>Sequências</span><strong>{result.consecutive.pairs}</strong><small>maior sequência: {result.consecutive.maxRun}</small></li>
        {result.sum.historyPercentile !== null && <li><span>Soma no histórico</span><strong>percentil {result.sum.historyPercentile.toLocaleString('pt-BR')}</strong></li>}
      </ul>
      <div className="st-faixas">{result.groups.map((group) => <div key={group.label}><small>{group.label}</small><strong>{group.count}</strong></div>)}</div>
    </Card>
    <Card title="Se tivesse jogado antes" subtitle={`Resultado deste jogo nos ${fmtInt(result.history.draws)} sorteios da base`}>
      {result.history.hitsDistribution.length === 0 ? <p className="st-empty">Sem histórico para comparar.</p> : <Bars items={result.history.hitsDistribution.slice(0, 6).map((item) => ({ label: `${item.hits} acerto${item.hits === 1 ? '' : 's'}`, value: item.count }))} format={(v) => `${fmtInt(v)}×`} />}
      {result.history.best && <p className="st-insight">Melhor resultado: <strong>{result.history.best.hits} acertos</strong> no concurso {result.history.best.contest}.</p>}
    </Card>
    <Card title="Cada dezena do seu jogo" subtitle="Situação no histórico" wide>
      <div className="st-table-wrap"><table className="st-table"><thead><tr><th>Dezena</th><th>Vezes</th><th>% dos concursos</th><th>Atraso</th><th>Situação</th></tr></thead><tbody>
        {result.numberStats.map((s) => <tr key={s.number}><td><span className="st-ball is-small">{pad(s.number)}</span></td><td>{s.count}</td><td>{s.frequencyPct.toLocaleString('pt-BR')}%</td><td>{s.delay}</td><td><div className="st-chips">{s.hot && <Chip tone="hot">em alta</Chip>}{s.cold && <Chip tone="cold">em baixa</Chip>}{s.overdue && <Chip tone="late">atrasada</Chip>}{!s.hot && !s.cold && !s.overdue && <Chip tone="ok">normal</Chip>}</div></td></tr>)}
      </tbody></table></div>
    </Card>
    {result.notes.length > 0 && <div className="st-note is-wide"><strong>Observações sobre este jogo</strong><ul>{result.notes.map((note) => <li key={note}>{note}</li>)}</ul></div>}
    <p className="st-muted is-wide">{stats.disclaimer}</p>
  </>;
}

/* ───────────── Sugestões ───────────── */
const STRATEGIES: Array<{ id: string; label: string; text: string }> = [
  { id: 'equilibrado', label: 'Equilibrado', text: 'Soma e paridade típicas, sem sequências longas ou padrões, evitando datas.' },
  { id: 'quentes', label: 'Em alta', text: 'Equilibrado, dando mais peso às dezenas que saíram mais nos últimos concursos.' },
  { id: 'atrasados', label: 'Atrasadas', text: 'Equilibrado, dando mais peso às dezenas que estão há mais tempo sem sair.' },
  { id: 'misto', label: 'Misto', text: 'Combina dezenas em alta e atrasadas.' },
  { id: 'aleatorio', label: 'Aleatório puro', text: 'Sem nenhum filtro: sorteio simples entre todos os números.' },
];

function Sugestoes({ stats, onAnalyze }: { stats: LotteryStats; onAnalyze: (numbers: number[]) => void }) {
  const { betMin, betMax } = stats.rule;
  const [strategy, setStrategy] = useState('equilibrado');
  const [size, setSize] = useState(betMin);
  const [games, setGames] = useState(3);
  const [fixed, setFixed] = useState('');
  const [exclude, setExclude] = useState('');
  const [result, setResult] = useState<Suggestions | null>(null);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [copied, setCopied] = useState<number | null>(null);
  const sizes = useMemo(() => { const list: number[] = []; for (let k = betMin; k <= betMax; k += 1) list.push(k); return list; }, [betMin, betMax]);
  async function generate() {
    setLoading(true); setError('');
    const params = new URLSearchParams({ jogos: String(games), dezenas: String(size), estrategia: strategy });
    if (fixed.trim()) params.set('fixos', fixed.trim());
    if (exclude.trim()) params.set('excluir', exclude.trim());
    try {
      const response = await fetch(`/api/v1/estatisticas/${stats.modalidade}/sugestoes?${params.toString()}`);
      const body = await response.json() as Suggestions & { message?: string | string[] };
      if (!response.ok) setError(Array.isArray(body.message) ? body.message.join(' ') : body.message ?? 'Não foi possível gerar as sugestões.');
      else setResult(body);
    } catch { setError('Não foi possível conectar ao serviço.'); } finally { setLoading(false); }
  }
  async function copy(index: number, numbers: number[]) {
    try { await navigator.clipboard.writeText(numbers.map(pad).join(' ')); setCopied(index); setTimeout(() => setCopied(null), 1800); } catch { /* sem permissão da área de transferência */ }
  }
  return <div className="st-grid">
    <Card title="Gerador de jogos equilibrados" subtitle="Monta jogos com as características mais comuns dos sorteios" wide>
      <div className="st-strategies" role="radiogroup" aria-label="Estratégia">{STRATEGIES.map((item) => <button key={item.id} type="button" role="radio" aria-checked={strategy === item.id} className={`st-strategy${strategy === item.id ? ' is-on' : ''}`} onClick={() => setStrategy(item.id)}><strong>{item.label}</strong><small>{item.text}</small></button>)}</div>
      <div className="st-form">
        {sizes.length > 1 && <label className="st-field"><span>Dezenas por jogo</span><select value={size} onChange={(event) => setSize(Number(event.target.value))}>{sizes.map((k) => <option key={k} value={k}>{k}</option>)}</select></label>}
        <label className="st-field"><span>Quantos jogos</span><select value={games} onChange={(event) => setGames(Number(event.target.value))}>{[1, 2, 3, 5, 8, 10].map((k) => <option key={k} value={k}>{k}</option>)}</select></label>
        <label className="st-field"><span>Incluir (opcional)</span><input value={fixed} onChange={(event) => setFixed(event.target.value)} placeholder="ex.: 7, 10" inputMode="numeric" /></label>
        <label className="st-field"><span>Evitar (opcional)</span><input value={exclude} onChange={(event) => setExclude(event.target.value)} placeholder="ex.: 13, 22" inputMode="numeric" /></label>
      </div>
      <div className="st-actions"><button type="button" className="button button-primary" onClick={() => void generate()} disabled={loading}>{loading ? 'Gerando…' : result ? 'Gerar outros jogos' : 'Gerar jogos'}</button></div>
      {error && <div className="form-message form-error" role="alert">{error}</div>}
    </Card>
    {result && <>
      <div className="st-suggestions is-wide">{result.games.map((game, index) => <article className="st-suggestion" key={game.numbers.join('-')}>
        <header><strong>Jogo {index + 1}</strong><small>soma {game.sum} · {game.odd} ímpar{game.odd === 1 ? '' : 'es'} · {game.even} par{game.even === 1 ? '' : 'es'}</small></header>
        <Balls numbers={game.numbers} />
        {game.reasons.length > 0 && <ul>{game.reasons.slice(0, 4).map((reason) => <li key={reason}>{reason}</li>)}</ul>}
        <footer><button type="button" className="button button-ghost" onClick={() => void copy(index, game.numbers)}>{copied === index ? 'Copiado!' : 'Copiar'}</button><button type="button" className="button button-ghost" onClick={() => onAnalyze(game.numbers)}>Analisar</button></footer>
      </article>)}</div>
      <Card title="Critérios usados" subtitle={`Base: ${fmtInt(result.baseHistorica)} sorteios`} wide><ul className="st-criteria">{result.criteria.map((item) => <li key={item}>{item}</li>)}</ul></Card>
    </>}
    <div className="st-note is-wide"><strong>Importante:</strong> estas sugestões não aumentam a chance de ganhar — todas as combinações têm a mesma probabilidade. Elas apenas evitam padrões muito populares (o que pode reduzir a divisão do prêmio se você for premiado) e montam jogos com características comuns nos sorteios.</div>
  </div>;
}

/* ───────────── Painel ───────────── */
export function StatsDashboard({ stats }: { stats: LotteryStats }) {
  const [tab, setTab] = useState<Tab>('panorama');
  const [analyzeSeed, setAnalyzeSeed] = useState<number[] | undefined>();
  const [seedKey, setSeedKey] = useState(0);
  const next = stats.proximoConcurso;
  const first = stats.probabilidades.faixas[0];
  return <div className="st-dashboard">
    <div className="st-disclaimer" role="note"><strong>Estatística não é previsão.</strong> {stats.disclaimer}</div>
    <div className="st-kpis is-top">
      <Kpi label="Sorteios analisados" value={fmtInt(stats.sample.draws)} hint={stats.sample.firstContest ? `concursos ${stats.sample.firstContest} a ${stats.sample.lastContest}` : 'importando histórico…'} />
      <Kpi label="Último concurso" value={stats.sample.lastContest ? `#${stats.sample.lastContest}` : '—'} hint={fmtDate(stats.sample.lastDate)} />
      <Kpi label="Próximo prêmio estimado" value={next?.premioEstimado ? money(next.premioEstimado) : '—'} hint={next ? `concurso ${next.concurso}${next.acumulado ? ' · acumulado' : ''}` : undefined} />
      <Kpi label="Chance do prêmio máximo" value={first ? `1 em ${fmtInt(first.oneIn)}` : '—'} hint="jogo simples" />
    </div>
    <div className="st-tabs" role="tablist" aria-label="Seções de estatísticas">{TABS.map((item) => <button key={item.id} type="button" role="tab" aria-selected={tab === item.id} className={`st-tab${tab === item.id ? ' is-on' : ''}`} onClick={() => setTab(item.id)}><strong>{item.label}</strong><small>{item.hint}</small></button>)}</div>
    <div role="tabpanel">
      {tab === 'panorama' && <Panorama stats={stats} />}
      {tab === 'numeros' && <Numeros stats={stats} />}
      {tab === 'probabilidades' && <Probabilidades stats={stats} />}
      {tab === 'analisar' && <Analisar key={seedKey} stats={stats} initial={analyzeSeed} />}
      {tab === 'sugestoes' && <Sugestoes stats={stats} onAnalyze={(numbers) => { setAnalyzeSeed(numbers); setSeedKey((k) => k + 1); setTab('analisar'); }} />}
    </div>
  </div>;
}
