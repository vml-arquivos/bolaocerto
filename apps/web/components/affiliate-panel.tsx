'use client';
import { Fragment, useEffect, useState } from 'react';
import { authenticatedFetch } from '../lib/client-api';
import { formatBRL as money } from '../lib/format';
import { modalityNames } from '../lib/domain';

type Rec = Record<string, any>;

/** Painel do afiliado: totais e, por bolão, quanto foi vendido, quantas cotas faltam e quem comprou / quem já pagou. */
export function AffiliatePanelBoard() {
  const [data, setData] = useState<Rec | null>(null);
  const [error, setError] = useState('');
  const [open, setOpen] = useState<string | null>(null);
  useEffect(() => {
    void authenticatedFetch('/api/v1/afiliados/me/painel', { cache: 'no-store' }).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Não foi possível carregar o painel.');
      setData(body as Rec);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar.'));
  }, []);
  if (error) return <div className="form-message form-error" role="alert">{error}</div>;
  if (!data) return <p className="muted" role="status">Carregando seu painel…</p>;
  const totals: Rec = data.totais ?? {};
  const pools: Rec[] = data.boloes ?? [];
  return <section className="affiliate-table-card" aria-label="Painel de vendas">
    <div className="affiliate-card-heading"><div><span className="overline">Painel de vendas</span><h2>Seus bolões em números</h2><p>Quanto vendeu, quantas cotas faltam e quem já pagou em cada bolão seu ou vendido pelo seu link.</p></div></div>
    <div className="kpi-grid">
      <div><small>Valor vendido</small><strong>{money(totals.valorVendido)}</strong></div>
      <div><small>Minha comissão (a receber + recebida)</small><strong>{money(String(Number(totals.comissaoPendente ?? 0) + Number(totals.comissaoPaga ?? 0)))}</strong></div>
      <div><small>Cotas vendidas</small><strong>{totals.cotasVendidas ?? 0}</strong></div>
      <div><small>Cotas reservadas</small><strong>{totals.cotasReservadas ?? 0}</strong></div>
      <div><small>Cotas que faltam</small><strong>{totals.cotasRestantes ?? 0}</strong></div>
      <div><small>Clientes / pagantes</small><strong>{totals.clientes ?? 0} / {totals.clientesPagantes ?? 0}</strong></div>
      <div><small>Bolões abertos</small><strong>{totals.boloesAbertos ?? 0} de {totals.boloes ?? 0}</strong></div>
      <div><small>Grupos</small><strong>{totals.grupos ?? 0}</strong></div>
    </div>
    {pools.length === 0 ? <div className="affiliate-empty"><strong>Ainda não há bolões nem vendas.</strong><p>Crie um bolão na aba Bolões ou compartilhe o link de um bolão aberto.</p></div>
      : <div className="affiliate-table-scroll"><table><thead><tr><th>Bolão</th><th>Situação</th><th>Vendidas</th><th>Reservadas</th><th>Faltam</th><th>Vendido</th><th>Quem comprou</th></tr></thead><tbody>
        {pools.map((pool) => <Fragment key={pool.bolaoId}>
          <tr>
            <td><strong>{modalityNames[pool.modalidade ?? ''] ?? pool.modalidade ?? 'Bolão'}</strong><br /><small>{pool.concurso && pool.concurso > 0 ? `Concurso ${pool.concurso}` : 'Concurso a definir'}{pool.grupo ? ` · ${pool.grupo}` : ''}{pool.proprio ? ' · criado por você' : ' · vendido pelo seu link'}</small></td>
            <td><span className={`affiliate-status ${pool.status}`}>{String(pool.status).replaceAll('_', ' ')}</span></td>
            <td>{pool.cotasVendidas}{pool.totalCotas ? ` de ${pool.totalCotas}` : ''}</td>
            <td>{pool.cotasReservadas}</td>
            <td>{pool.cotasRestantes ?? '∞'}</td>
            <td>{money(pool.valorVendido)}</td>
            <td><button type="button" className="text-link" onClick={() => setOpen(open === pool.bolaoId ? null : pool.bolaoId)} aria-expanded={open === pool.bolaoId}>{pool.pagantes} pagaram / {pool.compradores}</button></td>
          </tr>
          {open === pool.bolaoId && <tr><td colSpan={7}>{pool.quemComprou.length === 0 ? <small>Ninguém comprou este bolão ainda.</small> : <ul className="group-members">{pool.quemComprou.map((buyer: Rec, index: number) => <li key={`${buyer.nome}-${index}`}><span>{buyer.nome}</span><small>{buyer.pagou ? `Pagou ${buyer.cotasPagas} cota(s) · ${money(buyer.valorPago)}` : 'Ainda não pagou'}{buyer.cotasReservadas > 0 ? ` · ${buyer.cotasReservadas} reservada(s)` : ''}</small></li>)}</ul>}</td></tr>}
        </Fragment>)}
      </tbody></table></div>}
  </section>;
}
