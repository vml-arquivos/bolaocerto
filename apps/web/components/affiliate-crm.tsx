'use client';
import { FormEvent, useCallback, useEffect, useState } from 'react';
import { authenticatedFetch } from '../lib/client-api';
import { formatBRL as money } from '../lib/format';
import { modalityNames } from '../lib/domain';

type Rec = Record<string, any>;

async function call(path: string, options?: RequestInit) {
  const response = await authenticatedFetch(path, options);
  const body = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(body.message) ? body.message.join(' ') : body.message || 'Não foi possível concluir.');
  return body as Rec;
}
const day = (value?: string | null) => { if (!value) return '—'; const date = new Date(value); return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR'); };
const digits = (value?: string | null) => String(value ?? '').replace(/\D/g, '');
const whatsapp = (phone?: string | null, text = '') => { const number = digits(phone); return number.length >= 10 ? `https://wa.me/${number.length <= 11 ? `55${number}` : number}${text ? `?text=${encodeURIComponent(text)}` : ''}` : null; };
const Stage = ({ etapa, nome }: { etapa: string; nome?: string }) => <span className={`crm-stage is-${etapa}`}>{nome ?? etapa}</span>;

/** Mensagem pronta por etapa: o afiliado só confere e envia pelo WhatsApp. */
function suggestedText(row: Rec) {
  const first = String(row.nome ?? '').split(' ')[0];
  if (row.etapa === 'reservou') return `Oi, ${first}! Vi que você reservou uma cota no Bolão Livre e falta só o pagamento. Posso te ajudar com o Pix?`;
  if (row.etapa === 'reserva_vencida') return `Oi, ${first}! Sua reserva no Bolão Livre venceu antes do pagamento. Quer que eu te mande o link de um bolão aberto para reservar de novo?`;
  if (row.etapa === 'cadastrado') return `Oi, ${first}! Tudo bem? Tem bolão aberto no Bolão Livre e a cota é bem acessível. Quer que eu te mostre como participar?`;
  if (row.etapa === 'inativo') return `Oi, ${first}! Faz um tempo que você não participa de um bolão. Abriu um novo no Bolão Livre, quer dar uma olhada?`;
  return `Oi, ${first}! Abriu bolão novo no Bolão Livre. Quer participar dessa?`;
}

/** CRM do afiliado: funil de vendas, lista dos clientes dele e ficha com anotações e próximo contato. */
export function AffiliateCrm() {
  const [overview, setOverview] = useState<Rec | null>(null);
  const [list, setList] = useState<Rec | null>(null);
  const [stage, setStage] = useState('');
  const [term, setTerm] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [error, setError] = useState('');
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const query = new URLSearchParams({ pagina: String(page), porPagina: '20', ordenar: 'ultima' });
      if (stage) query.set('etapa', stage);
      if (term) query.set('busca', term);
      const [summary, rows] = await Promise.all([call('/api/v1/afiliados/me/crm/resumo'), call(`/api/v1/afiliados/me/crm/clientes?${query.toString()}`)]);
      setOverview(summary); setList(rows); setError('');
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Falha ao carregar os clientes.'); }
  }, [page, stage, term]);
  useEffect(() => { void load(); }, [load]);

  if (error && !overview) return <div className="form-message form-error" role="alert">{error}</div>;
  if (!overview) return <p className="muted" role="status">Carregando seus clientes…</p>;
  const totals: Rec = overview.totais ?? {};
  const funnel: Rec = overview.funil ?? {};
  const stages: Rec[] = funnel.etapas ?? [];
  const max = Math.max(1, ...stages.map((item) => Number(item.clientes) || 0));

  return <div className="affiliate-crm">
    <section className="affiliate-table-card">
      <div className="affiliate-card-heading"><div><span className="overline">Seus clientes</span><h2>Funil de vendas</h2><p>Todo cliente que entrou pelo seu link, pelo seu grupo ou comprou nos seus bolões. Toque em uma etapa para ver só essas pessoas.</p></div></div>
      <div className="kpi-grid">
        <div><small>Clientes</small><strong>{totals.clientes ?? 0}</strong></div>
        <div><small>Já pagaram</small><strong>{funnel.totais?.jaPagaram ?? 0}</strong></div>
        <div><small>Conversão (reservou → pagou)</small><strong>{funnel.totais?.pagaramDeReservaramPct ?? 0}%</strong></div>
        <div><small>Total pago por eles</small><strong>{money(totals.receitaTotal)}</strong></div>
        <div><small>Ticket médio</small><strong>{money(totals.ticketMedio)}</strong></div>
        <div><small>Falta pagar</small><strong>{money(totals.valorPendente)}</strong></div>
      </div>
      <div className="crm-funnel">{stages.map((item) => <button type="button" key={item.chave} className={`crm-funnel-step ${stage === item.chave ? 'is-on' : ''}`} onClick={() => { setStage(stage === item.chave ? '' : item.chave); setPage(1); }}>
        <span>{item.nome}</span><strong>{item.clientes}</strong>
        <span className="crm-funnel-bar" aria-hidden="true"><i style={{ width: `${Math.round(((Number(item.clientes) || 0) / max) * 100)}%` }} /></span>
        <small>{item.acao}</small>
      </button>)}</div>
    </section>

    {(overview.paraChamarAgora ?? []).length > 0 && <section className="affiliate-table-card">
      <div className="affiliate-card-heading"><div><h2>Para chamar agora</h2><p>Quem está com pagamento pendente, perdeu o prazo ou sumiu. A mensagem já vem pronta.</p></div></div>
      <div className="affiliate-list-cards">{overview.paraChamarAgora.map((row: Rec) => { const link = whatsapp(row.telefone, suggestedText(row)); return <article key={row.id}>
        <div className="pool-card-topline"><strong>{row.nome}</strong><Stage etapa={row.etapa} nome={row.etapaNome} /></div>
        <small>{row.proximaAcao}{row.valorPendente > 0 ? ` · falta pagar ${money(row.valorPendente)}` : ''}</small>
        <div className="affiliate-row-actions">{link ? <a className="button button-secondary" href={link} target="_blank" rel="noreferrer">Chamar no WhatsApp</a> : <small>Sem telefone cadastrado.</small>}<button type="button" onClick={() => setSelected(row.id)}>Abrir ficha</button></div>
      </article>; })}</div>
    </section>}

    {(overview.acompanhamentos ?? []).length > 0 && <section className="affiliate-table-card">
      <div className="affiliate-card-heading"><div><h2>Contatos programados</h2><p>Combinados para os próximos 7 dias (ou já atrasados).</p></div></div>
      <div className="affiliate-invite-list">{overview.acompanhamentos.map((row: Rec) => <div key={row.id}><div><strong>{row.nome}</strong><small>{row.etapaNome} · {day(row.proximoContatoEm)}</small></div><button type="button" className="text-link" onClick={() => setSelected(row.id)}>Abrir ficha</button></div>)}</div>
    </section>}

    {selected && <ClientSheet id={selected} onClose={() => setSelected(null)} onChanged={() => void load()} />}

    <section className="affiliate-table-card">
      <div className="affiliate-card-heading"><div><h2>{stage ? stages.find((item) => item.chave === stage)?.nome ?? 'Clientes' : 'Todos os clientes'}</h2><p>{list?.total ?? 0} {(list?.total ?? 0) === 1 ? 'cliente' : 'clientes'}{stage ? <> · <button type="button" className="text-link" onClick={() => { setStage(''); setPage(1); }}>limpar filtro</button></> : ''}</p></div></div>
      <form className="affiliate-invite-tools" onSubmit={(event: FormEvent) => { event.preventDefault(); setTerm(search.trim()); setPage(1); }}>
        <label><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, e-mail ou etiqueta" /></label>
        <button className="button button-secondary" type="submit">Buscar</button>
      </form>
      {(list?.items ?? []).length === 0 ? <div className="affiliate-empty"><strong>Nenhum cliente aqui ainda.</strong><p>Envie o seu link: quem se cadastrar por ele, entrar no seu grupo ou comprar nos seus bolões aparece neste funil.</p></div>
        : <div className="affiliate-table-scroll"><table><thead><tr><th>Cliente</th><th>Etapa</th><th>Pago</th><th>Cotas</th><th>Última compra</th><th>Próximo contato</th><th></th></tr></thead><tbody>
          {(list?.items ?? []).map((row: Rec) => { const link = whatsapp(row.telefone, suggestedText(row)); return <tr key={row.id}>
            <td><strong>{row.nome}</strong><br /><small>{row.cidade ? `${row.cidade}${row.uf ? `/${row.uf}` : ''}` : row.email}</small>{(row.etiquetas ?? []).length > 0 && <><br /><small>#{row.etiquetas.join(' #')}</small></>}</td>
            <td><Stage etapa={row.etapa} nome={row.etapaNome} /></td>
            <td>{row.totalGasto > 0 ? money(row.totalGasto) : '—'}{row.valorPendente > 0 && <><br /><small>falta {money(row.valorPendente)}</small></>}</td>
            <td>{row.cotasPagas}</td>
            <td>{row.ultimaCompraEm ? day(row.ultimaCompraEm) : '—'}</td>
            <td>{row.proximoContatoEm ? day(row.proximoContatoEm) : '—'}</td>
            <td><div className="affiliate-row-actions">{link && <a className="button button-secondary" href={link} target="_blank" rel="noreferrer">WhatsApp</a>}<button type="button" onClick={() => setSelected(row.id)}>Ficha</button></div></td>
          </tr>; })}
        </tbody></table></div>}
      {(list?.paginas ?? 1) > 1 && <div className="affiliate-row-actions" style={{ marginTop: 12 }}><button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Anterior</button><small>Página {list?.pagina} de {list?.paginas}</small><button type="button" disabled={page >= (list?.paginas ?? 1)} onClick={() => setPage((value) => value + 1)}>Próxima →</button></div>}
    </section>
  </div>;
}

function ClientSheet({ id, onClose, onChanged }: { id: string; onClose: () => void; onChanged: () => void }) {
  const [data, setData] = useState<Rec | null>(null);
  const [tags, setTags] = useState('');
  const [note, setNote] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);

  const load = useCallback(async () => {
    try {
      const result = await call(`/api/v1/afiliados/me/crm/clientes/${id}`);
      setData(result); const client = result.cliente ?? {};
      setTags((client.etiquetas ?? []).join(', ')); setNote(client.nota ?? ''); setNext(client.proximoContatoEm ? String(client.proximoContatoEm).slice(0, 10) : '');
    } catch (reason) { setMessage({ ok: false, text: reason instanceof Error ? reason.message : 'Não foi possível abrir a ficha.' }); }
  }, [id]);
  useEffect(() => { void load(); }, [load]);

  async function save(event: FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(null);
    try {
      await call(`/api/v1/afiliados/me/crm/clientes/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ etiquetas: tags.split(',').map((tag) => tag.trim()).filter(Boolean), nota: note.trim() || null, proximoContatoEm: next ? new Date(`${next}T12:00:00-03:00`).toISOString() : null }) });
      setMessage({ ok: true, text: 'Ficha salva.' }); await load(); onChanged();
    } catch (reason) { setMessage({ ok: false, text: reason instanceof Error ? reason.message : 'Não foi possível salvar.' }); } finally { setBusy(false); }
  }

  if (!data) return <section className="affiliate-table-card" aria-busy="true"><p className="muted">{message?.text ?? 'Abrindo a ficha…'}</p>{message && <button type="button" className="button button-ghost" onClick={onClose}>Fechar</button>}</section>;
  const client: Rec = data.cliente ?? {};
  const history: Rec[] = data.historico ?? [];
  const link = whatsapp(client.telefone, suggestedText(client));
  return <section className="affiliate-table-card" aria-label={`Ficha de ${client.nome}`}>
    <div className="affiliate-card-heading"><div><span className="overline">Ficha do cliente</span><h2>{client.nome}</h2><p><Stage etapa={client.etapa} nome={client.etapaNome} /> · {client.proximaAcao}</p></div><button type="button" className="button button-ghost" onClick={onClose}>Fechar</button></div>
    <div className="kpi-grid">
      <div><small>Total pago</small><strong>{money(client.totalGasto)}</strong></div>
      <div><small>Cotas pagas</small><strong>{client.cotasPagas}</strong></div>
      <div><small>Bolões diferentes</small><strong>{client.boloesDistintos}</strong></div>
      <div><small>Falta pagar</small><strong>{money(client.valorPendente)}</strong></div>
      <div><small>Última compra</small><strong>{client.ultimaCompraEm ? day(client.ultimaCompraEm) : '—'}</strong></div>
      <div><small>Cliente desde</small><strong>{day(client.cadastradoEm)}</strong></div>
    </div>
    <p className="muted">{client.email}{client.telefone ? ` · ${client.telefone}` : ' · sem telefone'}{client.cidade ? ` · ${client.cidade}/${client.uf ?? ''}` : ''}</p>
    {link && <p><a className="button button-primary" href={link} target="_blank" rel="noreferrer">Chamar no WhatsApp com mensagem pronta</a></p>}
    <form className="affiliate-form" onSubmit={save}>
      <label>Etiquetas (separe por vírgula)<input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="família, grupo do trabalho, prefere Mega" /></label>
      <label>Próximo contato<input type="date" value={next} onChange={(event) => setNext(event.target.value)} /></label>
      <label>Anotações<textarea value={note} onChange={(event) => setNote(event.target.value)} maxLength={2000} placeholder="O que combinaram, preferências, dúvidas…" /></label>
      {message && <div className={`form-message ${message.ok ? 'form-success' : 'form-error'}`} role="status">{message.text}</div>}
      <button className="button button-primary" disabled={busy}>{busy ? 'Salvando…' : 'Salvar ficha'}</button>
    </form>
    <h3>Histórico nos seus bolões</h3>
    {history.length === 0 ? <p className="muted">Sem cotas nos seus bolões ainda.</p> : <div className="affiliate-table-scroll"><table><thead><tr><th>Bolão</th><th>Cotas</th><th>Valor</th><th>Situação</th><th>Data</th></tr></thead><tbody>
      {history.map((item) => <tr key={item.id}><td>{modalityNames[item.modalidade] ?? item.modalidade}{item.concurso > 0 ? ` #${item.concurso}` : ''}</td><td>{item.quantidade}</td><td>{money(item.valor)}</td><td>{item.pago ? 'Pago' : item.status === 'reservada' ? `Aguardando pagamento${item.reservaExpiraEm ? ` até ${day(item.reservaExpiraEm)}` : ''}` : String(item.status).replaceAll('_', ' ')}</td><td>{day(item.criadoEm)}</td></tr>)}
    </tbody></table></div>}
  </section>;
}
