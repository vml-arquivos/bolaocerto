'use client';
import { useEffect, useMemo, useState } from 'react';
import { modalityNames } from '../lib/domain';

type Day = { data: string; valor: number; cotas: number; vendas: number };
type Insights = {
  totais: { valor: number; taxa: number; comissao: number; cotas: number; vendas: number; ticketMedio: number; clientes: number };
  serie: Day[];
  melhorDia: Day | null;
  porModalidade: Array<{ modalidade: string; valor: number; cotas: number }>;
  origem: { afiliado: { valor: number; cotas: number; vendas: number }; direta: { valor: number; cotas: number; vendas: number } };
  topBoloes: Array<{ id: string; nome: string; modalidade: string; valor: number; cotas: number }>;
  funil: { iniciadas: number; pagas: number; pendentes: number; desistencias: number };
  porHora: number[];
  melhorHora: number | null;
  porDiaSemana: number[];
  clientes: { novos: number; recorrentes: number };
};

const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const brlShort = (value: number) => (value >= 1000 ? `R$ ${(value / 1000).toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mil` : brl(value));
const pct = (part: number, total: number) => (total > 0 ? Math.round((part / total) * 100) : 0);
const dayLabel = (iso: string) => { const [, m, d] = iso.split('-'); return `${d}/${m}`; };
const WEEK = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];

/** Vendas por dia: área com linha (valor) e tooltip ao passar o mouse/tocar. Uma escala só (valor em R$). */
function SalesChart({ serie }: { serie: Day[] }) {
  const [hover, setHover] = useState<number | null>(null);
  const W = 760; const H = 220; const pad = { l: 8, r: 8, t: 14, b: 26 };
  const max = Math.max(...serie.map((d) => d.valor), 1);
  const x = (i: number) => pad.l + (serie.length <= 1 ? (W - pad.l - pad.r) / 2 : (i * (W - pad.l - pad.r)) / (serie.length - 1));
  const y = (v: number) => pad.t + (H - pad.t - pad.b) * (1 - v / max);
  const line = serie.map((d, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(d.valor).toFixed(1)}`).join(' ');
  const area = serie.length ? `${line} L${x(serie.length - 1).toFixed(1)},${H - pad.b} L${x(0).toFixed(1)},${H - pad.b} Z` : '';
  const step = Math.max(1, Math.ceil(serie.length / 8));
  const active = hover !== null ? serie[hover] : null;
  return <div className="dvz-sales">
    <svg viewBox={`0 0 ${W} ${H}`} role="img" aria-label={`Vendas por dia: total ${brl(serie.reduce((s, d) => s + d.valor, 0))}`} preserveAspectRatio="none" onMouseLeave={() => setHover(null)}>
      {[0.25, 0.5, 0.75, 1].map((f) => <line key={f} className="dvz-grid" x1={pad.l} x2={W - pad.r} y1={y(max * f)} y2={y(max * f)} />)}
      <line className="dvz-axis" x1={pad.l} x2={W - pad.r} y1={H - pad.b} y2={H - pad.b} />
      {area && <path className="dvz-area" d={area} />}
      {line && <path className="dvz-line" d={line} />}
      {serie.map((d, i) => i % step === 0 || i === serie.length - 1 ? <text key={d.data} className="dvz-tick" x={x(i)} y={H - 8} textAnchor="middle">{dayLabel(d.data)}</text> : null)}
      {active && hover !== null && <><line className="dvz-cross" x1={x(hover)} x2={x(hover)} y1={pad.t} y2={H - pad.b} /><circle className="dvz-dot" cx={x(hover)} cy={y(active.valor)} r={5} /></>}
      {serie.map((d, i) => <rect key={`h${d.data}`} x={x(i) - (W / Math.max(serie.length, 1)) / 2} y={0} width={W / Math.max(serie.length, 1)} height={H} fill="transparent" onMouseEnter={() => setHover(i)} onTouchStart={() => setHover(i)} />)}
    </svg>
    {active ? <div className="dvz-tip" style={{ left: `${(x(hover!) / W) * 100}%` }}><strong>{dayLabel(active.data)}</strong><span>{brl(active.valor)}</span><small>{active.cotas} {active.cotas === 1 ? 'cota' : 'cotas'} · {active.vendas} {active.vendas === 1 ? 'venda' : 'vendas'}</small></div> : null}
  </div>;
}

/** Rosca de duas fatias (afiliado x venda direta), com legenda e rótulos de valor. */
function Donut({ a, b }: { a: { label: string; value: number }; b: { label: string; value: number } }) {
  const total = a.value + b.value;
  const r = 52; const c = 2 * Math.PI * r;
  const share = total > 0 ? a.value / total : 0;
  const gap = total > 0 && share > 0 && share < 1 ? 3 : 0;
  return <div className="dvz-donut">
    <svg viewBox="0 0 140 140" role="img" aria-label={`${a.label}: ${pct(a.value, total)}%, ${b.label}: ${pct(b.value, total)}%`}>
      <circle className="dvz-donut-track" cx="70" cy="70" r={r} />
      {total > 0 && <circle className="dvz-donut-b" cx="70" cy="70" r={r} strokeDasharray={`${Math.max(c * (1 - share) - gap, 0)} ${c}`} strokeDashoffset={-(c * share)} transform="rotate(-90 70 70)" />}
      {total > 0 && share > 0 && <circle className="dvz-donut-a" cx="70" cy="70" r={r} strokeDasharray={`${Math.max(c * share - gap, 0)} ${c}`} transform="rotate(-90 70 70)" />}
      <text x="70" y="66" textAnchor="middle" className="dvz-donut-big">{pct(a.value, total)}%</text>
      <text x="70" y="84" textAnchor="middle" className="dvz-donut-small">por afiliados</text>
    </svg>
    <ul className="dvz-legend">
      <li><i className="sw-a" /><span>{a.label}</span><b>{brl(a.value)}</b></li>
      <li><i className="sw-b" /><span>{b.label}</span><b>{brl(b.value)}</b></li>
    </ul>
  </div>;
}

/** Barras horizontais com rótulo e valor (uma cor só: tamanho = quantidade). */
function BarList({ rows, empty }: { rows: Array<{ key: string; label: string; value: number; text: string; sub?: string }>; empty: string }) {
  const max = Math.max(...rows.map((r) => r.value), 1);
  if (!rows.length) return <p className="muted">{empty}</p>;
  return <ul className="dvz-bars">{rows.map((row) => <li key={row.key} title={`${row.label}: ${row.text}`}>
    <div className="dvz-bar-head"><span>{row.label}</span><b>{row.text}</b></div>
    <div className="dvz-bar-track"><i style={{ width: `${Math.max((row.value / max) * 100, 2)}%` }} /></div>
    {row.sub && <small>{row.sub}</small>}
  </li>)}</ul>;
}

/** Colunas pequenas (horário ou dia da semana); a maior fica destacada. */
function Columns({ values, labels, every = 1, unit }: { values: number[]; labels: string[]; every?: number; unit: string }) {
  const max = Math.max(...values, 1);
  const top = values.indexOf(Math.max(...values));
  return <div className="dvz-cols" role="img" aria-label={labels.map((l, i) => `${l}: ${values[i]} ${unit}`).join(', ')}>
    {values.map((value, i) => <div key={labels[i]} className={`dvz-col${value > 0 && i === top ? ' is-top' : ''}`} title={`${labels[i]}: ${value} ${unit}`}>
      <i style={{ height: `${value > 0 ? Math.max((value / max) * 100, 6) : 2}%` }} />
      <small>{i % every === 0 ? labels[i] : ''}</small>
    </div>)}
  </div>;
}

/**
 * Painel de gráficos e infográficos do Resumo: segue o período escolhido no topo da página e se atualiza a cada minuto.
 */
export function DashboardInsights({ period }: { period: string }) {
  const [data, setData] = useState<Insights | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let off = false;
    const load = () => fetch(`/api/v1/admin/dashboard/insights?periodo=${encodeURIComponent(period)}`, { credentials: 'include', cache: 'no-store' })
      .then(async (response) => { const body = await response.json().catch(() => ({})); if (!response.ok) throw new Error(body?.message ?? 'Não foi possível carregar os gráficos.'); return body; })
      .then((body) => { if (!off) { setData(body); setError(''); } })
      .catch((err) => { if (!off) setError(err instanceof Error ? err.message : 'Não foi possível carregar os gráficos.'); });
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, 60000);
    return () => { off = true; window.clearInterval(timer); };
  }, [period]);

  const modalityRows = useMemo(() => (data?.porModalidade ?? []).map((row) => ({ key: row.modalidade, label: modalityNames[row.modalidade] ?? row.modalidade, value: row.valor, text: brl(row.valor), sub: `${row.cotas} ${row.cotas === 1 ? 'cota' : 'cotas'}` })), [data]);
  const poolRows = useMemo(() => (data?.topBoloes ?? []).map((row) => ({ key: row.id, label: row.nome, value: row.valor, text: brl(row.valor), sub: `${row.cotas} ${row.cotas === 1 ? 'cota vendida' : 'cotas vendidas'}` })), [data]);

  if (error) return <p className="form-message form-error" role="alert">{error}</p>;
  if (!data) return <p className="muted">Carregando gráficos…</p>;
  const f = data.funil;
  const conversion = pct(f.pagas, f.iniciadas);
  const totalClients = data.clientes.novos + data.clientes.recorrentes;
  return <div className="dvz">
    <div className="dvz-tiles">
      <article className="dvz-tile"><span>Vendido no período</span><strong>{brlShort(data.totais.valor)}</strong><small>{data.totais.cotas} cotas em {data.totais.vendas} vendas</small></article>
      <article className="dvz-tile"><span>Ticket médio</span><strong>{brl(data.totais.ticketMedio)}</strong><small>por venda</small></article>
      <article className="dvz-tile"><span>Sua taxa</span><strong>{brlShort(data.totais.taxa)}</strong><small>comissões: {brl(data.totais.comissao)}</small></article>
      <article className="dvz-tile"><span>Conversão</span><strong>{conversion}%</strong><small>das reservas viraram pagamento</small></article>
      <article className="dvz-tile"><span>Clientes</span><strong>{data.totais.clientes}</strong><small>{data.clientes.recorrentes} voltaram a comprar</small></article>
    </div>

    <section className="dvz-card dvz-span-2"><header><h3>Vendas por dia</h3><small>{data.melhorDia ? `Melhor dia: ${dayLabel(data.melhorDia.data)} · ${brl(data.melhorDia.valor)}` : 'Sem vendas no período'}</small></header><SalesChart serie={data.serie} /></section>

    <section className="dvz-card"><header><h3>De onde vêm as vendas</h3><small>valor vendido</small></header><Donut a={{ label: 'Pelos afiliados', value: data.origem.afiliado.valor }} b={{ label: 'Venda direta', value: data.origem.direta.valor }} /></section>

    <section className="dvz-card"><header><h3>Funil de pagamento</h3><small>reservas criadas no período</small></header>
      <ul className="dvz-funnel">
        <li><span>Reservas</span><div><i style={{ width: '100%' }} /></div><b>{f.iniciadas}</b></li>
        <li><span>Pagas</span><div><i style={{ width: `${Math.max(pct(f.pagas, f.iniciadas), f.pagas ? 2 : 0)}%` }} /></div><b>{f.pagas} <small>({pct(f.pagas, f.iniciadas)}%)</small></b></li>
        <li><span>Aguardando</span><div><i className="is-wait" style={{ width: `${Math.max(pct(f.pendentes, f.iniciadas), f.pendentes ? 2 : 0)}%` }} /></div><b>{f.pendentes}</b></li>
        <li><span>Desistiram</span><div><i className="is-lost" style={{ width: `${Math.max(pct(f.desistencias, f.iniciadas), f.desistencias ? 2 : 0)}%` }} /></div><b>{f.desistencias} <small>({pct(f.desistencias, f.iniciadas)}%)</small></b></li>
      </ul>
    </section>

    <section className="dvz-card"><header><h3>Por modalidade</h3><small>valor vendido</small></header><BarList rows={modalityRows} empty="Sem vendas no período." /></section>

    <section className="dvz-card"><header><h3>Bolões que mais venderam</h3><small>top 5</small></header><BarList rows={poolRows} empty="Sem vendas no período." /></section>

    <section className="dvz-card dvz-span-2"><header><h3>Horário das vendas</h3><small>{data.melhorHora !== null ? `Pico às ${String(data.melhorHora).padStart(2, '0')}h` : 'cotas vendidas por hora'}</small></header><Columns values={data.porHora} labels={data.porHora.map((_, h) => `${String(h).padStart(2, '0')}h`)} every={3} unit="cotas" /></section>

    <section className="dvz-card"><header><h3>Dia da semana</h3><small>cotas vendidas</small></header><Columns values={data.porDiaSemana} labels={WEEK} unit="cotas" />
      <div className="dvz-split"><span>Clientes novos <b>{data.clientes.novos}</b></span><div className="dvz-split-bar" role="img" aria-label={`Novos ${pct(data.clientes.novos, totalClients)}%, recorrentes ${pct(data.clientes.recorrentes, totalClients)}%`}><i className="sw-a" style={{ width: `${pct(data.clientes.novos, totalClients)}%` }} /><i className="sw-b" style={{ width: `${pct(data.clientes.recorrentes, totalClients)}%` }} /></div><span>Recorrentes <b>{data.clientes.recorrentes}</b></span></div>
    </section>
  </div>;
}
