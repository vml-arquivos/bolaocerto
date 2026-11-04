'use client';
import { useEffect, useState } from 'react';
import { authenticatedFetch } from '../lib/client-api';
import { modalityNames } from '../lib/domain';
import { formatBRL as money } from '../lib/format';

type Row = { id: string; comprador: string; bolaoId: string; modalidade: string | null; concurso: number | null; sorteio: string | null; quantidade: number; valor: string; status: string; criadoEm: string; comissao: { valor: string; status: string } | null };
type Result = { total: number; items: Row[] };

const FILTERS = [['', 'Todas'], ['paga', 'Pagas'], ['reservada', 'Reservadas'], ['registrada', 'Registradas'], ['premiada', 'Premiadas']] as const;
const label = (value: string) => value.replaceAll('_', ' ');
const date = (value: string) => { const parsed = new Date(value); return Number.isNaN(parsed.getTime()) ? '—' : parsed.toLocaleDateString('pt-BR'); };

/** Aba "Cotas": cada cota vendida pelo link do afiliado, com a situação e a comissão. O comprador aparece só com nome e inicial. */
export function AffiliateQuotas() {
  const [status, setStatus] = useState('');
  const [data, setData] = useState<Result | null>(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let off = false;
    setData(null); setError('');
    void authenticatedFetch(`/api/v1/afiliados/me/cotas${status ? `?status=${status}` : ''}`).then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Não foi possível carregar as cotas.');
      if (!off) setData(body as Result);
    }).catch((reason) => { if (!off) setError(reason instanceof Error ? reason.message : 'Falha ao carregar.'); });
    return () => { off = true; };
  }, [status]);
  const items = data?.items ?? [];
  const sum = (predicate: (row: Row) => boolean) => items.filter(predicate).reduce((total, row) => total + row.quantidade, 0);
  return <section className="affiliate-table-card">
    <div className="affiliate-card-heading"><div><span className="overline">Controle</span><h2>Cotas do seu link</h2><p>Cada cota comprada por quem veio do seu link ou do seu código. Por privacidade, o comprador aparece só com o primeiro nome e a inicial do sobrenome.</p></div></div>
    <div className="aff-filters" role="group" aria-label="Filtrar cotas">{FILTERS.map(([key, name]) => <button key={key} type="button" className={status === key ? 'is-active' : ''} aria-pressed={status === key} onClick={() => setStatus(key)}>{name}</button>)}</div>
    {error && <div className="form-message form-error" role="alert">{error}</div>}
    {!data && !error && <p className="muted" role="status">Carregando as cotas…</p>}
    {data && <>
      <div className="affiliate-kpis compact"><article><span>Listadas</span><strong>{sum(() => true)}</strong></article><article><span>Pagas</span><strong>{sum((row) => ['paga', 'registrada', 'apurada', 'premiada'].includes(row.status))}</strong></article><article><span>Reservadas</span><strong>{sum((row) => row.status === 'reservada')}</strong></article></div>
      {items.length === 0 ? <div className="affiliate-empty"><strong>Nenhuma cota {status ? 'com esta situação' : 'ainda'}.</strong><p>{status ? 'Tente outro filtro.' : 'Quando alguém comprar pelo seu link, a cota aparece aqui.'}</p></div> : <ul className="aff-quota-list">
        {items.map((row) => <li key={row.id}>
          <div className="aff-quota-head"><strong>{row.comprador}</strong><span className={`affiliate-status ${row.status}`}>{label(row.status)}</span></div>
          <small>{modalityNames[row.modalidade ?? ''] ?? row.modalidade ?? 'Bolão'} · {row.concurso && row.concurso > 0 ? `concurso ${row.concurso}` : 'concurso a definir'}</small>
          <div className="aff-quota-meta"><span>{row.quantidade} {row.quantidade === 1 ? 'cota' : 'cotas'} · <strong>{money(row.valor)}</strong></span><span>{date(row.criadoEm)}</span></div>
          <div className="aff-quota-commission">{row.comissao ? <>Comissão <strong>{money(row.comissao.valor)}</strong> · <span className={`affiliate-status ${row.comissao.status}`}>{label(row.comissao.status)}</span></> : <small>Comissão aparece quando a cota é paga.</small>}</div>
        </li>)}
      </ul>}
      {data.total > items.length && <p className="muted">Mostrando as {items.length} mais recentes de {data.total} cotas.</p>}
    </>}
  </section>;
}
