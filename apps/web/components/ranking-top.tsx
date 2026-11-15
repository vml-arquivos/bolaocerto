'use client';
import Link from 'next/link';
import { useCallback, useEffect, useRef, useState } from 'react';

type Row = { posicao: number; nome: string; nivel: string; nomeNivel: string; cotas: number; afiliadoId?: string; valor?: number };
type Data = { periodo: string; atualizadoEm: string; itens: Row[] };

const MEDAL = ['🥇', '🥈', '🥉'];
const pos = (n: number) => MEDAL[n - 1] ?? `${n}º`;
const PERIODS: Array<[string, string]> = [['mes', 'Este mês'], ['7d', '7 dias'], ['ano', 'Este ano'], ['total', 'Desde o início']];

/**
 * Ranking dos afiliados em formato compacto: só os 5 primeiros, discreto, e um botão que abre todos numa janela.
 * Atualiza sozinho. No site (source="public") mostra só o primeiro nome com a inicial e as cotas; no painel, o nome completo.
 */
export function RankingTop({ source, title = 'Ranking dos afiliados' }: { source: 'admin' | 'public'; title?: string }) {
  const [period, setPeriod] = useState('mes');
  const [data, setData] = useState<Data | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const dialog = useRef<HTMLDialogElement>(null);

  const load = useCallback(async () => {
    try {
      const path = source === 'admin' ? `/api/v1/admin/afiliados-ranking?periodo=${period}` : `/api/v1/afiliados/ranking?periodo=${period}`;
      const response = await fetch(path, { credentials: 'include', cache: 'no-store' });
      if (!response.ok) throw new Error('falhou');
      setData(await response.json()); setFailed(false);
    } catch { setFailed(true); }
  }, [period, source]);

  useEffect(() => {
    void load();
    const timer = window.setInterval(() => { if (document.visibilityState === 'visible') void load(); }, source === 'admin' ? 15000 : 30000);
    return () => window.clearInterval(timer);
  }, [load, source]);

  useEffect(() => {
    const node = dialog.current;
    if (!node) return;
    if (open && !node.open) node.showModal();
    if (!open && node.open) node.close();
  }, [open]);

  // No site, sem vendas ou sem resposta, a seção não aparece (não polui a página).
  if (source === 'public' && (failed || !data || data.itens.length === 0)) return null;
  const top = data?.itens.slice(0, 5) ?? [];

  const body = <div className={`ranking-top ranking-top-${source}`}>
    <div className="ranking-top-head">
      <strong>🏆 {title}</strong>
      <select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Período do ranking">{PERIODS.map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select>
    </div>
    {!data ? <p className="muted">{failed ? 'Ranking indisponível agora.' : 'Carregando…'}</p> : top.length === 0 ? <p className="muted">Nenhuma venda de afiliado neste período ainda.</p> : <ol className="ranking-top-list">
      {top.map((row) => <li key={`${row.posicao}-${row.nome}-${row.afiliadoId ?? ''}`} className={row.posicao <= 3 ? `is-top place-${row.posicao}` : undefined}>
        <span className="rt-pos">{pos(row.posicao)}</span>
        <span className="rt-name">{row.nome}<span className={`level-dot level-${row.nivel}`} title={row.nomeNivel} aria-label={`Nível ${row.nomeNivel}`} /></span>
        <span className="rt-cotas"><b>{row.cotas}</b> {row.cotas === 1 ? 'cota' : 'cotas'}</span>
      </li>)}
    </ol>}
    {data && data.itens.length > 0 && <div className="ranking-top-foot">
      <button type="button" className="ranking-top-more" onClick={() => setOpen(true)}>Ver ranking completo ({data.itens.length})</button>
      {source === 'admin' && <Link className="admin-text-link" href="/admin?view=ranking">Abrir página do ranking</Link>}
    </div>}
    {open && data && <dialog ref={dialog} className="ranking-dialog" onClose={() => setOpen(false)} onClick={(event) => { if (event.target === dialog.current) setOpen(false); }} aria-labelledby={`ranking-all-${source}`}>
      <div className="ranking-dialog-card">
        <header><h3 id={`ranking-all-${source}`}>🏆 {title}</h3><button type="button" className="numbers-dialog-close" aria-label="Fechar" onClick={() => setOpen(false)}>×</button></header>
        <small className="muted">{PERIODS.find(([key]) => key === period)?.[1]} · atualizado às {new Date(data.atualizadoEm).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</small>
        <ol className="ranking-top-list ranking-all-list">{data.itens.map((row) => <li key={`${row.posicao}-${row.nome}-${row.afiliadoId ?? ''}`} className={row.posicao <= 3 ? `is-top place-${row.posicao}` : undefined}>
          <span className="rt-pos">{pos(row.posicao)}</span>
          <span className="rt-name">{row.nome}<span className={`level-badge level-${row.nivel}`}>{row.nomeNivel}</span></span>
          <span className="rt-cotas"><b>{row.cotas}</b> {row.cotas === 1 ? 'cota' : 'cotas'}{source === 'admin' && row.valor !== undefined && <small> · {row.valor.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</small>}</span>
        </li>)}</ol>
      </div>
    </dialog>}
  </div>;
  // No site a seção só existe quando há ranking para mostrar.
  return source === 'public' ? <section className="section shell home-ranking" id="ranking" aria-label="Ranking dos afiliados">{body}</section> : body;
}
