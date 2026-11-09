'use client';

import { NumbersBank } from '../admin-numbers';
import { modalityNames } from '../../lib/domain';
import { money, statusLabel, statusClass, poolForAttachments, SectionHeading, Panel, Empty, Table } from './shared';
import type { AdminCtx, RecordValue } from './shared';

export function GamesView({ ctx }: { ctx: AdminCtx }) {
  const { items, gamesTab, setGamesTab, setAttachFor, notify } = ctx;
  const games = items.flatMap((pool) => (pool.jogos ?? []).map((game: RecordValue) => ({ ...game, pool })));
  return <><SectionHeading title="Apostas" /><div className="report-tabs" role="tablist" aria-label="Apostas"><button role="tab" aria-selected={gamesTab === 'bolaos'} className={`report-tab ${gamesTab === 'bolaos' ? 'is-current' : ''}`} onClick={() => setGamesTab('bolaos')}>Jogos dos bolões</button><button role="tab" aria-selected={gamesTab === 'banco'} className={`report-tab ${gamesTab === 'banco' ? 'is-current' : ''}`} onClick={() => setGamesTab('banco')}>Banco de números</button></div>{gamesTab === 'banco' ? <NumbersBank notify={notify} /> : <Panel title="Jogos cadastrados" description={`${games.length} jogos carregados nos bolões filtrados`}><Table minWidth={980}><thead><tr><th>Bolão</th><th>Modalidade</th><th>Concurso</th><th>Ordem</th><th>Números</th><th>Dezenas</th><th>Custo</th><th>Status</th><th>Comprovante</th></tr></thead><tbody>{games.map((game) => <tr key={game.id}><td><code>{game.pool.id?.slice(0, 8)}</code></td><td>{modalityNames[game.pool.concurso?.modalidade] ?? game.pool.concurso?.modalidade ?? '—'}</td><td>{game.pool.concurso ? (game.pool.concurso.numeroConcurso > 0 ? `#${game.pool.concurso.numeroConcurso}` : 'a definir') : '—'}</td><td>Jogo {String(game.ordem).padStart(3, '0')}</td><td><strong>{(game.numeros ?? []).map((number: number) => String(number).padStart(2, '0')).join(' · ') || game.pool.numerosApostados?.join(' · ') || '—'}</strong></td><td>{game.quantidadeDezenas ?? game.numeros?.length ?? 0}</td><td>{money(game.custo)}</td><td><span className={statusClass(game.status)}>{statusLabel(game.status)}</span></td><td><button type="button" className="admin-button admin-button-small admin-button-ghost" onClick={() => setAttachFor({ pool: poolForAttachments(game.pool) })}>Comprovante</button></td></tr>)}</tbody></Table>{!games.length && <Empty title="Nenhum jogo carregado" />}</Panel>}</>;
}
