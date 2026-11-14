'use client';
import { useCallback, useEffect, useState } from 'react';
import { Stars } from './testimonials';
import { statusClass } from './admin-views/shared';

type Row = { id: string; nome: string; texto: string; estrelas: number; alvo: string; afiliadoNome: string | null; criadoEm: string; atualizadoEm: string; status: 'pendente' | 'aprovado' | 'oculto'; autor: { nome: string; email: string } | null };
const LABEL = { pendente: 'Aguardando', aprovado: 'Publicado', oculto: 'Oculto' } as const;

async function call(path: string, init?: RequestInit) {
  const response = await fetch(path, { credentials: 'include', cache: 'no-store', ...init });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(data.message) ? data.message.join(' ') : data.message || 'Não foi possível concluir.');
  return data;
}

/** Tela "Depoimentos": aprovar, ocultar ou excluir o que os clientes escreveram. Só aprovado aparece no site. */
export function TestimonialsAdminView({ notify }: { notify: (type: 'success' | 'error', text: string) => void }) {
  const [status, setStatus] = useState<'pendente' | 'aprovado' | 'oculto' | ''>('pendente');
  const [data, setData] = useState<{ contagem: Record<string, number>; items: Row[] } | null>(null);
  const [busy, setBusy] = useState('');
  const load = useCallback(async () => { setData(await call(`/api/v1/admin/depoimentos${status ? `?status=${status}` : ''}`)); }, [status]);
  useEffect(() => { void load().catch((error) => notify('error', error.message)); }, [load, notify]);
  async function act(id: string, next: 'aprovado' | 'oculto' | 'excluir') {
    if (next === 'excluir' && !window.confirm('Excluir este depoimento de vez?')) return;
    setBusy(id);
    try {
      await call(`/api/v1/admin/depoimentos/${id}`, next === 'excluir' ? { method: 'DELETE' } : { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ status: next }) });
      notify('success', next === 'aprovado' ? 'Depoimento publicado no site.' : next === 'oculto' ? 'Depoimento ocultado.' : 'Depoimento excluído.');
      await load();
    } catch (error) { notify('error', error instanceof Error ? error.message : 'Não foi possível concluir.'); }
    finally { setBusy(''); }
  }
  const count = data?.contagem ?? {};
  return <section className="admin-section">
    <div className="admin-page-heading"><div><h1>Depoimentos</h1><p className="admin-muted-note">O que os clientes escreveram sobre o Bolão Livre e sobre os afiliados. Só o que você publicar aparece no site.</p></div></div>
    <div className="admin-chip-row" role="tablist" aria-label="Situação">{([['pendente', 'Aguardando'], ['aprovado', 'Publicados'], ['oculto', 'Ocultos'], ['', 'Todos']] as const).map(([key, label]) => <button key={key || 'todos'} type="button" role="tab" aria-selected={status === key} className={`admin-chip-button ${status === key ? 'is-current' : ''}`} onClick={() => setStatus(key)}>{label}{key ? <strong>{count[key] ?? 0}</strong> : null}</button>)}</div>
    {!data ? <p>Carregando…</p> : data.items.length === 0 ? <div className="admin-empty"><strong>Nenhum depoimento aqui.</strong></div> :
      <div className="admin-testimonials">{data.items.map((item) => <article key={item.id} className="admin-testimonial">
        <header><Stars value={item.estrelas} size="sm" /><span className={statusClass(item.status === 'oculto' ? 'inativo' : item.status)}>{LABEL[item.status]}</span></header>
        <p>“{item.texto}”</p>
        <small><strong>{item.nome}</strong> · {item.alvo === 'afiliado' ? `sobre o afiliado ${item.afiliadoNome ?? ''}` : 'sobre o Bolão Livre'} · {new Date(item.atualizadoEm).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' })}</small>
        {item.autor && <small>Conta: {item.autor.nome} · {item.autor.email}</small>}
        <div className="admin-row-actions">
          {item.status !== 'aprovado' && <button type="button" className="admin-button admin-button-small admin-button-primary" disabled={busy === item.id} onClick={() => void act(item.id, 'aprovado')}>Publicar</button>}
          {item.status !== 'oculto' && <button type="button" className="admin-button admin-button-small" disabled={busy === item.id} onClick={() => void act(item.id, 'oculto')}>Ocultar</button>}
          <button type="button" className="admin-button admin-button-small admin-button-danger" disabled={busy === item.id} onClick={() => void act(item.id, 'excluir')}>Excluir</button>
        </div>
      </article>)}</div>}
  </section>;
}
