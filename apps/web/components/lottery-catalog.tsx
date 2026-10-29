'use client';

import Link from 'next/link';
import { withinSaleWindow, hasShares } from '../lib/pool-availability';
import { useSaleClock } from './live-storefront';
import { useMemo, useState } from 'react';
import { modalityNames, PublicPool } from '../lib/domain';
import { PoolCard } from './pool-card';

export function LotteryCatalog({ pools, serverNow }: { pools: PublicPool[]; serverNow: number }) {
  const now = useSaleClock(serverNow);
  const [modality, setModality] = useState('todas');
  const [price, setPrice] = useState('todos');
  const modalities = Array.from(new Set(pools.map((pool) => pool.concurso?.modalidade).filter(Boolean))) as string[];
  const filtered = useMemo(() => pools.filter((pool) => {
    if (!withinSaleWindow(pool, now) || !hasShares(pool)) return false;
    const matchesModality = modality === 'todas' || pool.concurso?.modalidade === modality;
    const value = Number(pool.valorCota);
    const matchesPrice = price === 'todos' || (price === 'ate-30' && value <= 30) || (price === '30-100' && value > 30 && value <= 100) || (price === '100+' && value > 100);
    return matchesModality && matchesPrice;
  }), [modality, pools, price, now]);

  const grouped = new Map<string, PublicPool[]>();
  for (const pool of filtered) {
    const key = `${pool.grupoId}:${pool.concurso?.modalidade}:${pool.concurso?.numeroConcurso}`;
    grouped.set(key, [...(grouped.get(key) ?? []), pool]);
  }
  return <div className="catalog-shell">
    <div className="catalog-toolbar" aria-label="Filtros do catálogo de bolões">
      <label className="filter-control"><span>Modalidade</span><select value={modality} onChange={(event) => setModality(event.target.value)}><option value="todas">Todas as modalidades</option>{modalities.map((item) => <option key={item} value={item}>{modalityNames[item] ?? item}</option>)}</select></label>
      <label className="filter-control"><span>Valor da cota</span><select value={price} onChange={(event) => setPrice(event.target.value)}><option value="todos">Qualquer valor</option><option value="ate-30">Até R$ 30</option><option value="30-100">De R$ 30 a R$ 100</option><option value="100+">Acima de R$ 100</option></select></label>
      <span className="catalog-count">{filtered.length} {filtered.length === 1 ? 'opção encontrada' : 'opções encontradas'}</span>
    </div>
    {filtered.length ? <div className="pool-grid">{Array.from(grouped, ([key, lots]) => <div className="pool-lots" key={key}><PoolCard now={now} pool={lots[0]!} />{lots.length > 1 && <details><summary>Ver outros {lots.length - 1} bolões deste grupo no concurso</summary><p>Cada lote tem seus próprios jogos, cotas e comprovantes. Confira antes de comprar.</p>{lots.slice(1).map(pool => <PoolCard now={now} pool={pool} key={pool.id} />)}</details>}</div>)}</div> : <div className="empty-state"><span>BL</span><h3>Nenhum bolão combina com seus filtros</h3><p>Não há bolões disponíveis com estes filtros. Novos bolões aparecem assim que forem publicados para os próximos concursos.</p><button type="button" className="button button-ghost" onClick={() => { setModality('todas'); setPrice('todos'); }}>Limpar filtros</button><Link className="text-link" href="/resultados">Consultar resultados e histórico</Link></div>}
  </div>;
}
