'use client';
import { useEffect, useState } from 'react';
import { authenticatedFetch } from '../lib/client-api';
import { modalityNames } from '../lib/domain';
import { formatBRL as money } from '../lib/format';

type Row = { bolaoId: string; grupo: string | null; modalidade: string | null; concurso: number | null; sorteio: string | null; status: string; cotasVendidas: number; cotasReservadas: number; valorVendido: string; link: string };
type Sales = { codigoAfiliado: string; totalCotasVendidas: number; items: Row[] };

/** Aba "Vendas": quantas cotas cada bolão vendeu pelo link do afiliado, com o link rastreado de cada um. */
export function AffiliateSales() {
  const [data, setData] = useState<Sales | null>(null);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState('');
  useEffect(() => {
    void authenticatedFetch('/api/v1/afiliados/me/vendas').then(async (response) => {
      const body = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(body.message || 'Não foi possível carregar as vendas.');
      setData(body as Sales);
    }).catch((reason) => setError(reason instanceof Error ? reason.message : 'Falha ao carregar.'));
  }, []);
  async function copy(row: Row) {
    try { await navigator.clipboard.writeText(`${window.location.origin}${row.link}`); setCopied(row.bolaoId); window.setTimeout(() => setCopied(''), 2200); } catch { /* sem permissão da área de transferência */ }
  }
  if (error) return <div className="form-message form-error" role="alert">{error}</div>;
  if (!data) return <p className="muted" role="status">Carregando as vendas…</p>;
  return <section className="affiliate-table-card">
    <div className="affiliate-card-heading"><div><h2>Vendas por bolão</h2><p>Cotas vendidas pelos links com o seu código <strong>{data.codigoAfiliado}</strong>. Reservada é a cota que ainda não foi paga.</p></div></div>
    <div className="affiliate-kpis compact"><article><span>Cotas vendidas</span><strong>{data.totalCotasVendidas}</strong></article><article><span>Bolões com venda</span><strong>{data.items.filter((item) => item.cotasVendidas > 0).length}</strong></article></div>
    {data.items.length === 0 ? <p className="muted">Ainda não há cotas vindas dos seus links. Abra um bolão e use “Compartilhar este bolão”.</p> : <div className="affiliate-table-scroll"><table><thead><tr><th>Bolão</th><th>Vendidas</th><th>Reservadas</th><th>Valor vendido</th><th>Link</th></tr></thead><tbody>
      {data.items.map((row) => <tr key={row.bolaoId}><td><strong>{modalityNames[row.modalidade ?? ''] ?? row.modalidade ?? 'Bolão'}</strong><br /><small>{row.concurso && row.concurso > 0 ? `Concurso ${row.concurso}` : 'Concurso a definir'}{row.grupo ? ` · ${row.grupo}` : ''}</small></td><td>{row.cotasVendidas}</td><td>{row.cotasReservadas}</td><td>{money(row.valorVendido)}</td><td><button type="button" className="button button-secondary" onClick={() => void copy(row)}>{copied === row.bolaoId ? 'Copiado' : 'Copiar link'}</button></td></tr>)}
    </tbody></table></div>}
  </section>;
}
