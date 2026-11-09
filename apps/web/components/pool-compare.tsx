'use client';
import Link from 'next/link';
import { useMemo, useState } from 'react';
import { modalityNames, money, PublicPool, shortDate } from '../lib/domain';
import { concursoNo } from '../lib/contest';

type SortKey = 'sorteio' | 'cota' | 'taxa' | 'livres';

/** Percentual da cota que fica com o BL (taxa de serviço). */
export function feePercent(pool: Pick<PublicPool, 'precificacao' | 'taxaAdministracaoPct'>): number | null {
  const quota = Number(pool.precificacao?.quotaCents);
  const fee = Number(pool.precificacao?.feePerShare);
  if (quota > 0 && Number.isFinite(fee)) return Math.round((fee / quota) * 1000) / 10;
  const pct = Number(pool.taxaAdministracaoPct);
  return Number.isFinite(pct) ? pct : null;
}

export function sortPools(pools: PublicPool[], key: SortKey): PublicPool[] {
  const value = (pool: PublicPool): number => {
    if (key === 'cota') return Number(pool.valorCota);
    if (key === 'taxa') return feePercent(pool) ?? Number.POSITIVE_INFINITY;
    if (key === 'livres') return -(pool.cotasDisponiveis ?? Number.POSITIVE_INFINITY);
    return new Date(pool.concurso?.dataSorteio ?? 0).getTime();
  };
  return [...pools].sort((a, b) => value(a) - value(b));
}

/** Comparador de bolões abertos: mesma tabela para todos, com filtro por jogo e ordenação. */
export function PoolCompare({ pools }: { pools: PublicPool[] }) {
  const [modality, setModality] = useState('todos');
  const [sort, setSort] = useState<SortKey>('sorteio');
  const modalities = useMemo(() => [...new Set(pools.map((pool) => pool.concurso?.modalidade).filter((item): item is string => Boolean(item)))], [pools]);
  const rows = useMemo(() => sortPools(pools.filter((pool) => modality === 'todos' || pool.concurso?.modalidade === modality), sort), [pools, modality, sort]);
  if (!pools.length) return <div className="empty-state"><strong>Nenhum bolão aberto agora.</strong><p>Quando abrir um novo, ele aparece aqui. Você pode pedir aviso em <Link href="/minha-conta">Minha conta</Link>.</p></div>;
  return <div className="pool-compare">
    <div className="form-row">
      <div className="field"><label htmlFor="cmp-mod">Jogo</label><select id="cmp-mod" value={modality} onChange={(e) => setModality(e.target.value)}><option value="todos">Todos</option>{modalities.map((item) => <option key={item} value={item}>{modalityNames[item] ?? item}</option>)}</select></div>
      <div className="field"><label htmlFor="cmp-ord">Ordenar por</label><select id="cmp-ord" value={sort} onChange={(e) => setSort(e.target.value as SortKey)}><option value="sorteio">Sorteio mais próximo</option><option value="cota">Menor valor da cota</option><option value="taxa">Menor taxa de serviço</option><option value="livres">Mais cotas livres</option></select></div>
    </div>
    <div className="table-wrap"><table className="compare-table">
      <thead><tr><th>Bolão</th><th>Sorteio</th><th>Jogos</th><th>Cota</th><th>Taxa de serviço</th><th>Cotas livres</th><th><span className="sr-only">Abrir</span></th></tr></thead>
      <tbody>{rows.map((pool) => {
        const pct = feePercent(pool);
        const games = pool.jogos?.length ?? 0;
        const size = pool.jogos?.[0]?.numeros.length ?? pool.numerosApostados.length;
        return <tr key={pool.id}>
          <td><strong>{modalityNames[pool.concurso?.modalidade ?? ''] ?? pool.concurso?.modalidade ?? 'Bolão'}</strong><small className="muted"> · concurso {pool.concurso ? concursoNo(pool.concurso.numeroConcurso) : '—'}{pool.grupo?.nome ? ` · ${pool.grupo.nome}` : ''}</small></td>
          <td>{shortDate(pool.concurso?.dataSorteio)}</td>
          <td>{games > 0 ? `${games} ${games === 1 ? 'jogo' : 'jogos'} de ${size} números` : 'a definir'}</td>
          <td>{money(pool.valorCota)}</td>
          <td>{pct === null ? '—' : `${String(pct).replace('.', ',')}%`}{pool.precificacao?.feePerShare !== undefined ? <small className="muted"> ({money(Number(pool.precificacao.feePerShare) / 100)})</small> : null}</td>
          <td>{pool.cotasDisponiveis === null ? 'sem limite' : pool.cotasDisponiveis}</td>
          <td><Link className="button button-primary button-small" href={`/boloes/${pool.id}`}>Ver bolão</Link></td>
        </tr>;
      })}</tbody>
    </table></div>
    <p className="muted"><small>Os números e a taxa de serviço aparecem antes da reserva. O prêmio é pago pela CAIXA conforme o resultado oficial.</small></p>
  </div>;
}
