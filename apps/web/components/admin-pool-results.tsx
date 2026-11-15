'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { modalityNames } from '../lib/domain';
import { PoolGamesResult } from './pool-games-result';

type Pool = { id: string; grupo?: { nome?: string } | null; concurso?: { modalidade?: string; numeroConcurso?: number; dataSorteio?: string } | null; resultado?: { numerosSorteados?: number[]; numerosSegundoSorteio?: number[] } | null; jogos?: Array<{ ordem: number; numeros: number[] }>; numerosApostados?: number[] };

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
    const games = pool.jogos?.length ? pool.jogos : pool.numerosApostados?.length ? [{ ordem: 1, numeros: pool.numerosApostados }] : [];
    return <article className="apr-card" key={pool.id}>
      <header className="apr-head">
        <div><strong>{modalityNames[pool.concurso?.modalidade ?? ''] ?? 'Bolão'} · concurso {pool.concurso?.numeroConcurso}</strong><small>{pool.grupo?.nome ?? 'Bolão BL'}{pool.concurso?.dataSorteio ? ` · sorteio ${new Date(pool.concurso.dataSorteio).toLocaleDateString('pt-BR')}` : ''}</small></div>
        <Link className="admin-text-link" href={`/boloes/${pool.id}`} target="_blank">Ver bolão</Link>
      </header>
      <PoolGamesResult drawn={pool.resultado!.numerosSorteados!} second={pool.resultado!.numerosSegundoSorteio ?? []} games={games.map((game) => ({ ordem: game.ordem, numeros: game.numeros }))} maxGames={4} moreHref={`/boloes/${pool.id}`} />
    </article>;
  })}</div>;
}
