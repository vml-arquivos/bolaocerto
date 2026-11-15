'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import { Kpi } from './admin-views/shared';

type Row = { posicao: number; afiliadoId: string; nome: string; codigo: string; cotas: number; vendas: number; valor: number; clientes: number; boloes: number; ultimaVenda: string | null; nivel: string; nomeNivel: string };
type Ranking = { periodo: string; atualizadoEm: string; totais: { cotas: number; valor: number; vendas: number; afiliadosComVenda: number; afiliados: number }; itens: Row[] };

const PERIODS: Array<[string, string]> = [['hoje', 'Hoje'], ['7d', '7 dias'], ['mes', 'Este mês'], ['30d', '30 dias'], ['ano', 'Este ano'], ['total', 'Desde o início']];
const PERIOD_TEXT: Record<string, string> = { hoje: 'de hoje', '7d': 'dos últimos 7 dias', mes: 'do mês', '30d': 'dos últimos 30 dias', ano: 'do ano', total: 'desde o início' };
const REFRESH_MS = 15000;
const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const MEDAL = ['🥇', '🥈', '🥉'];
const when = (value: string | null) => (value ? new Date(value).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) : '—');

/**
 * Ranking de vendas dos afiliados: os campeões de venda, atualizado sozinho a cada 15 segundos
 * (entrou venda pelo link do afiliado, o ranking já muda). Dá para copiar e compartilhar com todos.
 */
export function AffiliateRanking() {
  const [period, setPeriod] = useState('mes');
  const [data, setData] = useState<Ranking | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const previous = useRef<Map<string, number>>(new Map());
  const [moved, setMoved] = useState<Record<string, 'up' | 'new'>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetch(`/api/v1/admin/afiliados-ranking?periodo=${period}`, { credentials: 'include', cache: 'no-store' });
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body?.message ?? 'Não foi possível carregar o ranking.');
      // Marca quem subiu de posição ou entrou no ranking desde a última atualização.
      const marks: Record<string, 'up' | 'new'> = {};
      if (previous.current.size) for (const row of body.itens as Row[]) { const before = previous.current.get(row.afiliadoId); if (before === undefined) marks[row.afiliadoId] = 'new'; else if (row.posicao < before) marks[row.afiliadoId] = 'up'; }
      previous.current = new Map((body.itens as Row[]).map((row) => [row.afiliadoId, row.posicao]));
      setMoved(marks);
      setData(body); setError('');
    } catch (err) { setError(err instanceof Error ? err.message : 'Não foi possível carregar o ranking.'); }
  }, [period]);

  useEffect(() => {
    previous.current = new Map();
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, REFRESH_MS);
    return () => window.clearInterval(timer);
  }, [load]);

  async function copy() {
    if (!data) return;
    const top = data.itens.slice(0, 10).map((row) => `${MEDAL[row.posicao - 1] ?? `${row.posicao}º`} ${row.nome} — ${row.cotas} ${row.cotas === 1 ? 'cota' : 'cotas'}`);
    const text = [`🏆 Ranking de vendas Bolão Livre ${PERIOD_TEXT[data.periodo] ?? ''}`.trim(), '', ...(top.length ? top : ['Ainda sem vendas neste período.']), '', 'Parabéns aos campeões! Bora vender mais 🚀'].join('\n');
    try { await navigator.clipboard.writeText(text); setCopied(true); window.setTimeout(() => setCopied(false), 2500); } catch { window.prompt('Copie o ranking:', text); }
  }

  const podium = data?.itens.filter((row) => row.posicao <= 3).slice(0, 3) ?? [];
  return <section className="ranking-view" aria-labelledby="ranking-titulo">
    <div className="ranking-head">
      <div><h2 id="ranking-titulo">Ranking de vendas dos afiliados</h2><p className="muted">Quem mais vendeu pelo próprio link. Conta só cota com pagamento confirmado e atualiza sozinho a cada 15 segundos.</p></div>
      <div className="ranking-actions"><span className="ranking-live" aria-live="polite"><i aria-hidden="true" />Ao vivo{data ? ` · ${new Date(data.atualizadoEm).toLocaleTimeString('pt-BR')}` : ''}</span><button type="button" className="admin-button admin-button-ghost" onClick={() => void copy()} disabled={!data}>{copied ? 'Ranking copiado ✓' : 'Copiar para compartilhar'}</button></div>
    </div>
    <nav className="report-tabs ranking-periods" aria-label="Período">{PERIODS.map(([key, label]) => <button key={key} type="button" className={`report-tab ${period === key ? 'is-current' : ''}`} aria-pressed={period === key} onClick={() => setPeriod(key)}>{label}</button>)}</nav>
    {error && <p className="form-message form-error" role="alert">{error}</p>}
    {!data ? <p className="muted">Carregando…</p> : <>
      <div className="admin-kpi-grid admin-kpi-grid-four ranking-kpis">
        <Kpi label="Cotas vendidas" value={data.totais.cotas} tone="green" />
        <Kpi label="Valor vendido" value={brl(data.totais.valor)} />
        <Kpi label="Vendas" value={data.totais.vendas} />
        <Kpi label="Afiliados com venda" value={`${data.totais.afiliadosComVenda} de ${data.totais.afiliados}`} tone="amber" />
      </div>
      {data.itens.length === 0 ? <div className="empty-state ranking-empty"><span aria-hidden="true">🏆</span><strong>Nenhuma venda de afiliado neste período ainda.</strong><p className="muted">Assim que entrar a primeira venda pelo link de um afiliado, o ranking aparece aqui.</p></div> : <>
        <ol className="ranking-podium" aria-label="Campeões">{podium.map((row) => <li key={row.afiliadoId} className={`podium-card place-${row.posicao}${moved[row.afiliadoId] ? ' is-moved' : ''}`}>
          <span className="podium-medal" aria-hidden="true">{MEDAL[row.posicao - 1]}</span>
          <strong className="podium-name">{row.nome}</strong>
          <span className={`level-badge level-${row.nivel}`}>{row.nomeNivel}</span>
          <span className="podium-cotas"><b>{row.cotas}</b> {row.cotas === 1 ? 'cota' : 'cotas'}</span>
          <small>{brl(row.valor)} · {row.clientes} {row.clientes === 1 ? 'cliente' : 'clientes'}</small>
        </li>)}</ol>
        <div className="admin-table-scroll"><table className="admin-table ranking-table"><thead><tr><th>#</th><th>Afiliado</th><th>Cotas</th><th>Valor vendido</th><th>Vendas e clientes</th><th>Última venda</th></tr></thead><tbody>
          {data.itens.map((row) => <tr key={row.afiliadoId} className={moved[row.afiliadoId] ? 'is-moved' : undefined}>
            <td className="td-nowrap ranking-pos"><strong>{MEDAL[row.posicao - 1] ?? `${row.posicao}º`}</strong>{moved[row.afiliadoId] === 'up' && <small className="ranking-up">▲ subiu</small>}{moved[row.afiliadoId] === 'new' && <small className="ranking-up">novo</small>}</td>
            <td><strong>{row.nome}</strong><small><code>{row.codigo}</code></small><span className={`level-badge level-${row.nivel}`}>{row.nomeNivel}</span></td>
            <td className="td-nowrap"><strong>{row.cotas}</strong></td>
            <td className="td-nowrap">{brl(row.valor)}</td>
            <td className="td-nowrap">{row.vendas} {row.vendas === 1 ? 'venda' : 'vendas'}<small>{row.clientes} {row.clientes === 1 ? 'cliente' : 'clientes'} · {row.boloes} {row.boloes === 1 ? 'bolão' : 'bolões'}</small></td>
            <td className="td-date">{when(row.ultimaVenda)}</td>
          </tr>)}
        </tbody></table></div>
      </>}
    </>}
  </section>;
}
