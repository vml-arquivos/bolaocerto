'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { modalityNames } from '../lib/domain';
import { PoolResultCard } from './pool-games-result';

type Pool = { id: string; grupo?: { nome?: string } | null; concurso?: { modalidade?: string; numeroConcurso?: number; dataSorteio?: string } | null; resultado?: { numerosSorteados?: number[]; numerosSegundoSorteio?: number[] } | null; jogos?: Array<{ ordem: number; numeros: number[] }>; numerosApostados?: number[]; valorCota?: string | number; cotasVendidas?: number };

/** Resumo do painel: resultado dos últimos bolões sorteados, com os números e o melhor jogo (acertos). */
export function AdminPoolResults({ limit = 8 }: { limit?: number }) {
  const [pools, setPools] = useState<Pool[] | null>(null);
  useEffect(() => {
    let off = false;
    fetch('/api/v1/boloes/sorteados', { credentials: 'include', cache: 'no-store' }).then((response) => (response.ok ? response.json() : [])).then((data) => { if (!off) setPools(Array.isArray(data) ? data : data?.items ?? []); }).catch(() => { if (!off) setPools([]); });
    return () => { off = true; };
  }, []);
  if (!pools) return <p className="muted">Carregando…</p>;
  const rows = pools.filter((pool) => pool.resultado?.numerosSorteados?.length).slice(0, limit);
  if (!rows.length) return <p className="muted">Quando um concurso for sorteado, o resultado dos bolões aparece aqui.</p>;
  return <div className="admin-pool-results">{rows.map((pool, index) => {
    const games = pool.jogos?.length ? pool.jogos : pool.numerosApostados?.length ? [{ ordem: 1, numeros: pool.numerosApostados }] : [];
    const contest = pool.concurso;
    const details = [
      pool.valorCota ? `${Number(pool.valorCota).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })} / cota` : '',
      pool.cotasVendidas !== undefined ? `${pool.cotasVendidas} ${pool.cotasVendidas === 1 ? 'cota vendida' : 'cotas vendidas'}` : '',
      `${games.length} ${games.length === 1 ? 'jogo' : 'jogos'}`,
    ].filter(Boolean);
    return <PoolResultCard key={pool.id} open={index === 0}
      title={`${modalityNames[contest?.modalidade ?? ''] ?? 'Bolão'} · concurso ${contest?.numeroConcurso ?? ''}`}
      subtitle={`${pool.grupo?.nome ?? 'Bolão BL'}${contest?.dataSorteio ? ` · sorteio ${new Date(contest.dataSorteio).toLocaleDateString('pt-BR')}` : ''}`}
      details={details}
      drawn={pool.resultado!.numerosSorteados!} second={pool.resultado!.numerosSegundoSorteio ?? []}
      games={games.map((game) => ({ ordem: game.ordem, numeros: game.numeros }))} moreHref={`/boloes/${pool.id}`} />;
  })}</div>;
}
