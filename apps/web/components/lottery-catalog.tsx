'use client';

import { useMemo, useState } from 'react';
import { modalityNames, PublicPool } from '../lib/domain';
import { PoolCard } from './pool-card';

export function LotteryCatalog({ pools }: { pools: PublicPool[] }) {
  const [modality, setModality] = useState('todas');
  const [price, setPrice] = useState('todos');
  const [onlyAvailable, setOnlyAvailable] = useState(true);
  const modalities = Array.from(new Set(pools.map((pool) => pool.concurso?.modalidade).filter(Boolean))) as string[];
  const filtered = useMemo(() => pools.filter((pool) => {
    const matchesModality = modality === 'todas' || pool.concurso?.modalidade === modality;
    const value = Number(pool.valorCota);
    const matchesPrice = price === 'todos' || (price === 'ate-30' && value <= 30) || (price === '30-100' && value > 30 && value <= 100) || (price === '100+' && value > 100);
    const matchesAvailability = !onlyAvailable || ((pool.cotasDisponiveis === null || pool.cotasDisponiveis > 0) && pool.status === 'aberto');
    return matchesModality && matchesPrice && matchesAvailability;
  }), [modality, onlyAvailable, pools, price]);

  return <div className="catalog-shell">
    <div className="catalog-toolbar" aria-label="Filtros do catálogo de bolões">
      <label className="filter-control"><span>Modalidade</span><select value={modality} onChange={(event) => setModality(event.target.value)}><option value="todas">Todas as modalidades</option>{modalities.map((item) => <option key={item} value={item}>{modalityNames[item] ?? item}</option>)}</select></label>
      <label className="filter-control"><span>Valor da cota</span><select value={price} onChange={(event) => setPrice(event.target.value)}><option value="todos">Qualquer valor</option><option value="ate-30">Até R$ 30</option><option value="30-100">De R$ 30 a R$ 100</option><option value="100+">Acima de R$ 100</option></select></label>
      <label className="switch-control"><input type="checkbox" checked={onlyAvailable} onChange={(event) => setOnlyAvailable(event.target.checked)} /><span>Somente com cotas</span></label>
      <span className="catalog-count">{filtered.length} {filtered.length === 1 ? 'opção encontrada' : 'opções encontradas'}</span>
    </div>
    {filtered.length ? <div className="pool-grid">{filtered.map((pool) => <PoolCard pool={pool} key={pool.id} />)}</div> : <div className="empty-state"><span>BL</span><h3>Nenhum bolão combina com seus filtros</h3><p>Amplie a busca ou remova o filtro de disponibilidade para consultar o catálogo completo.</p><button type="button" className="button button-ghost" onClick={() => { setModality('todas'); setPrice('todos'); setOnlyAvailable(false); }}>Limpar filtros</button></div>}
  </div>;
}
