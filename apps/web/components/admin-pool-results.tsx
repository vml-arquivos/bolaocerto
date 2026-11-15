'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { modalityNames } from '../lib/domain';

type Pool = { id: string; grupo?: { nome?: string } | null; concurso?: { modalidade?: string; numeroConcurso?: number; dataSorteio?: string } | null; resultado?: { numerosSorteados?: number[]; numerosSegundoSorteio?: number[] } | null; jogos?: Array<{ ordem: number; numeros: number[] }>; numerosApostados?: number[] };
const two = (n: number) => String(n).padStart(2, '0');

/** Resumo do painel: resultado dos últimos bolões sorteados, com os números e o melhor jogo (acertos). */
export function AdminPoolResults({ limit = 5 }: { limit?: number }) {
  const [pools, setPools] = useState<Pool[] | null>(null);
  useEffect(() => {
    let off = false;
    fetch('/api/v1/boloes/sorteados', { credentials: 'include', cache: 'no-store' }).then((response) => (response.ok ? response.json() : [])).then((data) => { if (!off) setPools(Array.isArray(data) ? data : data?.items ?? []); }).catch(() => { if (!off) setPools([]); });
    return () => { off = true; };
  }, []);
  if (!pools) return <p className="muted">Carregando…</p>;
  const rows = pools.filter((pool) => pool.resultado?.numerosSorteados?.length).slice(0, limit);
  if (!rows.length) return <p className="muted">Quando um concurso for sorteado, o resultado dos bolões aparece aqui.</p>;
  return <div className="admin-pool-results">{rows.map((pool) => {
    const drawn = pool.resultado!.numerosSorteados!;
    const second = pool.resultado!.numerosSegundoSorteio ?? [];
    const hits = new Set([...drawn, ...second]);
    const games = pool.jogos?.length ? pool.jogos : pool.numerosApostados?.length ? [{ ordem: 1, numeros: pool.numerosApostados }] : [];
    const best = games.reduce((max, game) => Math.max(max, game.numeros.filter((n) => hits.has(n)).length), 0);
    return <div className="apr-row" key={pool.id}>
      <div className="apr-title"><strong>{modalityNames[pool.concurso?.modalidade ?? ''] ?? 'Bolão'} #{pool.concurso?.numeroConcurso}</strong><small>{pool.grupo?.nome ?? 'Bolão BL'}</small></div>
      <div className="apr-balls" aria-label={`Números sorteados: ${drawn.map(two).join(', ')}`}>{drawn.map((n, i) => <span className="apr-ball" key={`${n}-${i}`}>{two(n)}</span>)}</div>
      <div className="apr-hits">{games.length ? <><b>{best}</b> {best === 1 ? 'acerto' : 'acertos'}<small>no melhor jogo{games.length > 1 ? ` de ${games.length}` : ''}</small></> : <small>sem jogos</small>}</div>
      <Link className="admin-text-link" href={`/boloes/${pool.id}`} target="_blank">Ver bolão</Link>
    </div>;
  })}</div>;
}
