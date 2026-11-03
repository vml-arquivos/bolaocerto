'use client';

import Link from 'next/link';
import { useState } from 'react';
import type { CSSProperties } from 'react';
import { modalityNames, money } from '../lib/domain';
import { lotteryVisual } from '../lib/lottery-config';
import { concursoNo } from '../lib/contest';
import { ball, ResultGroup } from '../lib/home';

const when = (value: string) => new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit', timeZone: 'America/Sao_Paulo' }).format(new Date(value)).replace(',', '');

/** Resultados oficiais por jogo: escolha o jogo e veja os últimos sorteios com as dezenas. */
export function ResultsTabs({ groups, moreHref }: { groups: ResultGroup[]; moreHref?: string }) {
  const [active, setActive] = useState(groups[0]?.modalidade ?? '');
  const group = groups.find((item) => item.modalidade === active) ?? groups[0];
  if (!group) return <div className="empty-state"><span aria-hidden="true">🎯</span><strong>Os resultados aparecem aqui assim que a CAIXA apurar o concurso.</strong></div>;
  const visual = lotteryVisual(group.modalidade);
  return <div className="results-box" style={{ '--result-accent': visual.accent } as CSSProperties}>
    <div className="results-tabs" role="tablist" aria-label="Escolher o jogo">{groups.map((item) => <button type="button" role="tab" key={item.modalidade} aria-selected={item.modalidade === group.modalidade} className={item.modalidade === group.modalidade ? 'is-active' : ''} onClick={() => setActive(item.modalidade)}><span aria-hidden="true">{lotteryVisual(item.modalidade).icon}</span>{modalityNames[item.modalidade] ?? item.modalidade}</button>)}</div>
    <div className="results-list" role="tabpanel">
      {group.sorteios.map((draw) => <article className="rs-row" key={draw.numeroConcurso}>
        <div className="rs-when"><strong>{when(draw.dataSorteio)}</strong><small>{draw.festa ? `${draw.festa} · ` : ''}Concurso {concursoNo(draw.numeroConcurso)}</small></div>
        <div className="rs-balls" aria-label={`Dezenas sorteadas: ${draw.numeros.map(ball).join(', ')}`}>
          <div>{draw.numeros.map((n, i) => <span className="rs-ball" key={`${n}-${i}`}>{ball(n)}</span>)}</div>
          {draw.segundoSorteio.length > 0 && <div className="rs-second"><small>2º sorteio</small>{draw.segundoSorteio.map((n, i) => <span className="rs-ball" key={`${n}-${i}`}>{ball(n)}</span>)}</div>}
        </div>
        <div className="rs-info">{draw.acumulado ? <span className="tag tag-closed">Acumulou</span> : draw.ganhadores ? <span className="tag tag-open">{draw.ganhadores} {draw.ganhadores === 1 ? 'ganhador' : 'ganhadores'}{draw.premio ? ` · ${money(draw.premio)}` : ''}</span> : null}</div>
      </article>)}
    </div>
    {moreHref && <Link className="results-more" href={moreHref}>Ver resultados anteriores <span aria-hidden="true">→</span></Link>}
  </div>;
}
