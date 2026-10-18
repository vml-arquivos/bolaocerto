'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import { api, brl, chip, dateOnly, dateTime, Empty, ExportBar, Kpi, label, modalityNames, Notify, Panel, Progress, Rec, ReleaseBadge, Table } from './admin-ui';

/* -------------------------------------------------------------------------- */
/* CRM de apostadores                                                         */
/* -------------------------------------------------------------------------- */

const SEGMENTS: Array<[string, string]> = [['', 'Todos'], ['vip', 'Apostadores maiores (VIP)'], ['recorrente', 'Recorrentes'], ['novo', 'Novos'], ['inativo', 'Inativos'], ['inadimplente', 'Com pendência'], ['sem_compra', 'Ainda não compraram']];
const LEVEL_CLASS: Record<string, string> = { diamante: 'status-chip status-info', ouro: 'status-chip status-warning', prata: 'status-chip', bronze: 'status-chip', sem_compra: 'status-chip' };
const LevelChip = ({ nivel, nome }: { nivel: string; nome?: string }) => <span className={LEVEL_CLASS[nivel] ?? 'status-chip'}>{nome ?? label(nivel)}</span>;

export function CrmView({ notify }: { notify: Notify }) {
  const [overview, setOverview] = useState<Rec | null>(null);
  const [list, setList] = useState<Rec | null>(null);
  const [segment, setSegment] = useState('');
  const [level, setLevel] = useState('');
  const [order, setOrder] = useState('gasto');
  const [search, setSearch] = useState('');
  const [term, setTerm] = useState('');
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const params = useCallback(() => {
    const entries: Record<string, string> = { ordenar: order };
    if (segment) entries.segmento = segment;
    if (level) entries.nivel = level;
    if (term) entries.busca = term;
    return entries;
  }, [segment, level, order, term]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const search = new URLSearchParams({ ...params(), pagina: String(page), porPagina: '25' });
      const [summary, rows] = await Promise.all([api('/api/v1/admin/crm/resumo'), api(`/api/v1/admin/crm/apostadores?${search.toString()}`)]);
      setOverview(summary); setList(rows);
    } catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível carregar o CRM.'); }
    finally { setLoading(false); }
  }, [params, page, notify]);
  useEffect(() => { void load(); }, [load]);

  const totals = overview?.totais ?? {};
  const criteria = overview?.criterios ?? {};
  const open = (id: string) => { setSelected(id); window.scrollTo({ top: 0, behavior: 'smooth' }); };

  return <>
    <div className="admin-page-heading"><div><span className="admin-eyebrow">Relacionamento</span><h1>CRM de apostadores</h1><p>Conheça quem mais investe, quem compra com frequência e quem precisa de atenção. Registre contatos e programe o próximo retorno.</p></div></div>

    {selected && <BettorDetail id={selected} onClose={() => setSelected(null)} onChanged={() => void load()} notify={notify} />}

    <div className="admin-kpi-grid">
      <Kpi label="Apostadores cadastrados" value={totals.cadastrados ?? 0} hint={`${totals.compradores ?? 0} já compraram`} tone="blue" />
      <Kpi label="Receita dos apostadores" value={brl(totals.receitaTotal)} hint="cotas pagas" tone="green" />
      <Kpi label="Ticket médio por apostador" value={brl(totals.ticketMedioPorApostador)} tone="violet" />
      <Kpi label="Receita dos VIP" value={brl(totals.receitaVip)} hint={`${totals.participacaoVipPct ?? 0}% da receita`} tone="amber" />
      <Kpi label="Reativar (VIP inativos)" value={(overview?.reativar ?? []).length} hint="apostadores maiores sem comprar" tone="rose" />
    </div>

    <Panel title="Níveis de apostador" description="O nível é definido pelo total já investido em cotas pagas.">
      <div className="admin-kpi-grid admin-kpi-grid-four">{(overview?.niveis ?? []).map((tier: Rec) => <Kpi key={tier.nivel} label={tier.nome} value={tier.apostadores} hint={`${brl(tier.valor)} investidos`} tone={tier.nivel === 'diamante' ? 'violet' : tier.nivel === 'ouro' ? 'amber' : tier.nivel === 'prata' ? 'blue' : 'green'} />)}</div>
      <p className="admin-help">Critérios atuais: <strong>Prata</strong> a partir de {brl(criteria.prata)} · <strong>Ouro</strong> a partir de {brl(criteria.ouro)} · <strong>Diamante</strong> a partir de {brl(criteria.diamante)}. <strong>Inativo</strong>: sem comprar há mais de {criteria.inativoDias} dias · <strong>Recorrente</strong>: {criteria.recorrenteMinBoloes}+ bolões diferentes · <strong>Novo</strong>: primeira compra nos últimos {criteria.novoDias} dias. Um apostador pode estar em vários segmentos ao mesmo tempo.</p>
    </Panel>

    <div className="admin-two-col">
      <Panel title="Maiores apostadores" description="Ranking por total investido">
        <Table minWidth={460}><thead><tr><th>#</th><th>Apostador</th><th>Nível</th><th>Investido</th><th>Cotas</th></tr></thead><tbody>{(overview?.maioresApostadores ?? []).map((row: Rec, index: number) => <tr key={row.id}><td>{index + 1}</td><td><button className="admin-link-button" onClick={() => open(row.id)}>{row.nome}</button><small>{row.boloesDistintos} bolão(ões) · última compra {dateOnly(row.ultimaCompraEm)}</small></td><td><LevelChip nivel={row.nivel} nome={row.nivelNome} /></td><td><strong>{brl(row.totalGasto)}</strong></td><td>{row.cotasPagas}</td></tr>)}</tbody></Table>
        {!(overview?.maioresApostadores ?? []).length && <Empty text="Ainda não há compras pagas" hint="Assim que houver pagamentos confirmados, o ranking aparece aqui." />}
      </Panel>
      <Panel title="Para reativar" description="Apostadores maiores que não compram há algum tempo">
        <Table minWidth={420}><thead><tr><th>Apostador</th><th>Nível</th><th>Investido</th><th>Sem comprar</th></tr></thead><tbody>{(overview?.reativar ?? []).map((row: Rec) => <tr key={row.id}><td><button className="admin-link-button" onClick={() => open(row.id)}>{row.nome}</button></td><td>{row.nivelNome}</td><td>{brl(row.totalGasto)}</td><td>{row.diasSemComprar} dias</td></tr>)}</tbody></Table>
        {!(overview?.reativar ?? []).length && <Empty text="Nenhum apostador maior inativo" hint="Ótimo sinal: seus melhores clientes estão comprando." />}
        {(overview?.acompanhamentos ?? []).length > 0 && <><h3 style={{ margin: '18px 0 8px', fontSize: 13 }}>Contatos programados (próximos 7 dias)</h3><Table minWidth={360}><tbody>{overview!.acompanhamentos.map((row: Rec) => <tr key={row.id}><td><button className="admin-link-button" onClick={() => open(row.id)}>{row.nome}</button></td><td>{dateTime(row.proximoContatoEm)}</td></tr>)}</tbody></Table></>}
      </Panel>
    </div>

    <Panel title="Todos os apostadores" description="Filtre por segmento, nível ou busque por nome, e-mail ou CPF. A planilha traz o CPF completo; o PDF e a tela mostram o CPF protegido." action={<ExportBar path="/api/v1/admin/crm/apostadores" params={params()} id="apostadores" onError={(text) => notify('error', text)} />}>
      <div className="admin-chip-row" role="tablist" aria-label="Segmentos">{SEGMENTS.map(([key, title]) => { const count = key ? (overview?.segmentos ?? []).find((item: Rec) => item.chave === key)?.apostadores : totals.cadastrados; return <button key={key || 'todos'} role="tab" aria-selected={segment === key} className={`admin-chip-button ${segment === key ? 'is-current' : ''}`} onClick={() => { setSegment(key); setPage(1); }}>{title}<strong>{count ?? 0}</strong></button>; })}</div>
      <form className="admin-toolbar-filters" style={{ marginBottom: 14 }} onSubmit={(event: FormEvent) => { event.preventDefault(); setTerm(search.trim()); setPage(1); }}>
        <label className="admin-field"><span>Buscar</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Nome, e-mail, CPF ou etiqueta" /></label>
        <label className="admin-field"><span>Nível</span><select value={level} onChange={(event) => { setLevel(event.target.value); setPage(1); }}><option value="">Todos</option><option value="diamante">Diamante</option><option value="ouro">Ouro</option><option value="prata">Prata</option><option value="bronze">Bronze</option></select></label>
        <label className="admin-field"><span>Ordenar por</span><select value={order} onChange={(event) => { setOrder(event.target.value); setPage(1); }}><option value="gasto">Maior investimento</option><option value="cotas">Mais cotas</option><option value="boloes">Mais bolões</option><option value="ultima">Compra mais recente</option><option value="nome">Nome (A–Z)</option></select></label>
        <button className="admin-button admin-button-primary" type="submit">Buscar</button>
      </form>
      {loading && <div className="admin-spinner" aria-label="Carregando" />}
      <Table minWidth={1180}><thead><tr><th>Apostador</th><th>Nível</th><th>Segmentos</th><th>Investido</th><th>Cotas</th><th>Bolões</th><th>Ticket médio</th><th>Última compra</th><th>Pendente</th><th>Ficha</th></tr></thead><tbody>{(list?.items ?? []).map((row: Rec) => <tr key={row.id}><td><strong>{row.nome}</strong><small>{row.email}{row.telefone ? ` · ${row.telefone}` : ''}</small></td><td><LevelChip nivel={row.nivel} nome={row.nivelNome} /></td><td>{(row.segmentoNomes ?? []).join(' · ') || '—'}{(row.etiquetas ?? []).length > 0 && <small>#{row.etiquetas.join(' #')}</small>}</td><td><strong>{brl(row.totalGasto)}</strong></td><td>{row.cotasPagas}</td><td>{row.boloesDistintos}</td><td>{row.compras ? brl(row.ticketMedio) : '—'}</td><td>{row.ultimaCompraEm ? <>{dateOnly(row.ultimaCompraEm)}<small>há {row.diasSemComprar} dia(s)</small></> : '—'}</td><td>{row.valorPendente > 0 ? <><strong>{brl(row.valorPendente)}</strong>{row.reservasVencidas > 0 && <small>{row.reservasVencidas} vencida(s)</small>}</> : '—'}</td><td><button className="admin-button admin-button-small admin-button-ghost" onClick={() => open(row.id)}>Abrir ficha</button></td></tr>)}</tbody></Table>
      {!loading && !(list?.items ?? []).length && <Empty text="Nenhum apostador encontrado" hint="Ajuste os filtros ou a busca." />}
      {(list?.paginas ?? 1) > 1 && <div className="admin-row-actions" style={{ marginTop: 14 }}><button className="admin-button admin-button-small admin-button-ghost" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>← Anterior</button><span className="admin-help" style={{ margin: 0 }}>Página {list?.pagina} de {list?.paginas} · {list?.total} apostadores</span><button className="admin-button admin-button-small admin-button-ghost" disabled={page >= (list?.paginas ?? 1)} onClick={() => setPage((value) => value + 1)}>Próxima →</button></div>}
    </Panel>
  </>;
}

function BettorDetail({ id, onClose, onChanged, notify }: { id: string; onClose: () => void; onChanged: () => void; notify: Notify }) {
  const [data, setData] = useState<Rec | null>(null);
  const [note, setNote] = useState('');
  const [tags, setTags] = useState('');
  const [next, setNext] = useState('');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try {
      const result = await api(`/api/v1/admin/crm/apostadores/${id}`);
      setData(result); setTags((result.etiquetas ?? []).join(', ')); setNext(result.proximoContatoEm ? String(result.proximoContatoEm).slice(0, 10) : '');
    } catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível abrir a ficha.'); onClose(); }
  }, [id, notify, onClose]);
  useEffect(() => { void load(); }, [load]);

  async function saveNote(event: FormEvent) {
    event.preventDefault(); if (note.trim().length < 2) return; setBusy(true);
    try { await api(`/api/v1/admin/crm/apostadores/${id}/notas`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ texto: note }) }); setNote(''); notify('success', 'Nota registrada.'); await load(); }
    catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível salvar a nota.'); } finally { setBusy(false); }
  }
  async function saveProfile(event: FormEvent) {
    event.preventDefault(); setBusy(true);
    try {
      await api(`/api/v1/admin/crm/apostadores/${id}`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ etiquetas: tags.split(',').map((tag) => tag.trim()).filter(Boolean), proximoContatoEm: next ? new Date(`${next}T12:00:00-03:00`).toISOString() : null }) });
      notify('success', 'Acompanhamento atualizado.'); await load(); onChanged();
    } catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível salvar.'); } finally { setBusy(false); }
  }

  if (!data) return <Panel title="Abrindo ficha…"><div className="admin-spinner" aria-label="Carregando" /></Panel>;
  const profile = data.perfil ?? {}; const metrics = data.metricas ?? {};
  return <Panel title={profile.nome} description={`${profile.email}${profile.telefone ? ` · ${profile.telefone}` : ''} · CPF ${profile.cpf}${profile.cidade ? ` · ${profile.cidade}/${profile.uf ?? ''}` : ''}`} action={<button className="admin-button admin-button-small admin-button-ghost" onClick={onClose}>Fechar ficha</button>}>
    <div className="admin-kpi-grid">
      <Kpi label="Nível" value={metrics.nivelNome ?? '—'} hint={(metrics.segmentoNomes ?? []).join(' · ')} tone="violet" />
      <Kpi label="Total investido" value={brl(metrics.totalGasto)} hint={`${metrics.compras ?? 0} compra(s) · ticket ${brl(metrics.ticketMedio)}`} tone="green" />
      <Kpi label="Cotas pagas" value={metrics.cotasPagas ?? 0} hint={`${metrics.boloesDistintos ?? 0} bolão(ões) diferentes`} tone="blue" />
      <Kpi label="Última compra" value={metrics.ultimaCompraEm ? dateOnly(metrics.ultimaCompraEm) : '—'} hint={metrics.diasSemComprar != null ? `há ${metrics.diasSemComprar} dia(s)` : 'nunca comprou'} tone="amber" />
      <Kpi label="Pendente" value={brl(metrics.valorPendente)} hint={`${metrics.cotasPendentes ?? 0} cota(s) aguardando`} tone="rose" />
    </div>
    <p className="admin-help">Cadastrado em {dateOnly(profile.cadastradoEm)}{profile.afiliadoOrigem ? ` · indicado por ${profile.afiliadoOrigem.nome} (${profile.afiliadoOrigem.codigo})` : ' · cadastro direto'} · KYC: {label(profile.statusKyc)}{Number(metrics.premiosGanhos) > 0 ? ` · prêmios: ${brl(metrics.premiosGanhos)}` : ''}</p>
    <div className="admin-two-col">
      <div>
        <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Acompanhamento</h3>
        <form onSubmit={saveProfile} className="admin-form-grid">
          <label className="admin-field"><span>Etiquetas (separe por vírgula)</span><input value={tags} onChange={(event) => setTags(event.target.value)} placeholder="vip, bolão grande, prefere mega" /></label>
          <label className="admin-field"><span>Próximo contato</span><input type="date" value={next} onChange={(event) => setNext(event.target.value)} /></label>
          <div className="admin-field" style={{ alignSelf: 'end' }}><button className="admin-button admin-button-primary" disabled={busy}>Salvar</button></div>
        </form>
        <p className="admin-help">A etiqueta <code>vip</code> promove o apostador a VIP mesmo abaixo do valor de corte.</p>
        <h3 style={{ margin: '16px 0 8px', fontSize: 13 }}>Notas do relacionamento</h3>
        <form onSubmit={saveNote} style={{ display: 'grid', gap: 8, marginBottom: 12 }}>
          <label className="admin-field"><span>Nova nota</span><textarea rows={3} value={note} onChange={(event) => setNote(event.target.value)} placeholder="Ex.: Ligou pedindo cotas maiores no próximo bolão da Mega da Virada." /></label>
          <div><button className="admin-button admin-button-small" disabled={busy || note.trim().length < 2}>Registrar nota</button></div>
        </form>
        {(data.notas ?? []).map((item: Rec) => <div className="admin-note" key={item.id}>{item.texto}<small>{item.autor} · {dateTime(item.criadoEm)}</small></div>)}
        {!(data.notas ?? []).length && <p className="admin-help">Nenhuma nota ainda.</p>}
      </div>
      <div>
        <h3 style={{ margin: '0 0 8px', fontSize: 13 }}>Modalidades preferidas</h3>
        <Table minWidth={320}><thead><tr><th>Modalidade</th><th>Cotas</th><th>Investido</th></tr></thead><tbody>{(data.modalidadesPreferidas ?? []).map((row: Rec) => <tr key={row.modalidade}><td>{modalityNames[row.modalidade] ?? row.modalidade}</td><td>{row.cotas}</td><td>{brl(row.valor)}</td></tr>)}</tbody></Table>
        {!(data.modalidadesPreferidas ?? []).length && <p className="admin-help">Sem compras pagas.</p>}
        <h3 style={{ margin: '16px 0 8px', fontSize: 13 }}>Histórico de participações</h3>
        <Table minWidth={420}><thead><tr><th>Data</th><th>Bolão</th><th>Qtd.</th><th>Valor</th><th>Situação</th></tr></thead><tbody>{(data.historico ?? []).map((row: Rec) => <tr key={row.id}><td>{dateTime(row.criadoEm)}</td><td>{modalityNames[row.modalidade] ?? row.modalidade} #{row.concurso}</td><td>{row.quantidade}</td><td>{brl(row.valor)}</td><td><span className={chip(row.status)}>{label(row.status)}</span></td></tr>)}</tbody></Table>
      </div>
    </div>
  </Panel>;
}

/* -------------------------------------------------------------------------- */
/* Controle de cotas por bolão                                                */
/* -------------------------------------------------------------------------- */

const FILTERS: Array<[string, string]> = [['todos', 'Todas'], ['pagas', 'Pagas'], ['aguardando', 'Aguardando pagamento'], ['canceladas', 'Canceladas']];

export function PoolControlView({ notify }: { notify: Notify }) {
  const [pools, setPools] = useState<Rec[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try { setPools(await api<Rec[]>('/api/v1/admin/relatorios/boloes')); }
    catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível carregar os bolões.'); }
    finally { setLoading(false); }
  }, [notify]);
  useEffect(() => { void load(); }, [load]);

  const totals = pools.reduce((acc, pool) => ({ pagas: acc.pagas + Number(pool.cotasPagas ?? 0), aguardando: acc.aguardando + Number(pool.cotasAguardando ?? 0), receita: acc.receita + Number(pool.receita ?? 0), aReceber: acc.aReceber + Number(pool.aReceber ?? 0) }), { pagas: 0, aguardando: 0, receita: 0, aReceber: 0 });

  return <>
    <div className="admin-page-heading"><div><span className="admin-eyebrow">Controle de cotas</span><h1>Controle por bolão</h1><p>Para cada bolão: quantas cotas foram vendidas, quem comprou, quem já pagou e quanto falta receber. Abra um bolão para ver os participantes e baixar o relatório em PDF, planilha ou CSV.</p></div></div>
    {selected && <PoolDetail id={selected} onClose={() => setSelected(null)} onChanged={() => void load()} notify={notify} />}
    <div className="admin-kpi-grid admin-kpi-grid-four">
      <Kpi label="Bolões" value={pools.length} tone="blue" />
      <Kpi label="Cotas pagas" value={totals.pagas} hint={`${totals.aguardando} aguardando pagamento`} tone="green" />
      <Kpi label="Receita paga" value={brl(totals.receita)} tone="violet" />
      <Kpi label="A receber" value={brl(totals.aReceber)} hint="reservas dentro do prazo" tone="amber" />
    </div>
    <Panel title="Bolões e ocupação das cotas" description="Clique em “Abrir” para ver cada participante." action={<ExportBar path="/api/v1/admin/relatorios/boloes" id="controle-cotas" onError={(text) => notify('error', text)} />}>
      {loading && <div className="admin-spinner" aria-label="Carregando" />}
      <Table minWidth={1200}><thead><tr><th>Bolão</th><th>Sorteio</th><th>Situação</th><th>Ocupação</th><th>Pagas</th><th>Aguardando</th><th>Livres</th><th>Participantes</th><th>A receber</th><th>Receita</th><th></th></tr></thead><tbody>{pools.map((pool) => <tr key={pool.id}><td><strong>{modalityNames[pool.modalidade] ?? pool.modalidade} #{pool.concurso}</strong><small>{pool.grupo} · {brl(pool.valorCota)}/cota</small></td><td>{dateTime(pool.sorteio)}</td><td><span className={chip(pool.status)}>{label(pool.status)}</span> <ReleaseBadge release={pool.gatilhoLiberacao === null ? null : { condicional: true, liberado: pool.liberado, gatilho: pool.gatilhoLiberacao }} /></td><td style={{ minWidth: 130 }}>{pool.percentualVendido === null ? 'Ilimitadas' : <><Progress value={pool.percentualVendido} tone={pool.percentualVendido >= 100 ? 'green' : 'blue'} /><small>{pool.percentualVendido}% de {pool.totalCotas}</small></>}</td><td><strong>{pool.cotasPagas}</strong></td><td>{pool.cotasAguardando}</td><td>{pool.cotasLivres === null ? '∞' : pool.cotasLivres}</td><td>{pool.participantes}</td><td>{brl(pool.aReceber)}</td><td><strong>{brl(pool.receita)}</strong></td><td><button className="admin-button admin-button-small" onClick={() => { setSelected(pool.id); window.scrollTo({ top: 0, behavior: 'smooth' }); }}>Abrir</button></td></tr>)}</tbody></Table>
      {!loading && !pools.length && <Empty text="Nenhum bolão cadastrado" hint="Crie um bolão em Loterias → Bolões." />}
    </Panel>
  </>;
}

function PoolDetail({ id, onClose, onChanged, notify }: { id: string; onClose: () => void; onChanged: () => void; notify: Notify }) {
  const [data, setData] = useState<Rec | null>(null);
  const [filter, setFilter] = useState('todos');
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    try { setData(await api(`/api/v1/admin/relatorios/boloes/${id}`)); }
    catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível abrir o bolão.'); onClose(); }
  }, [id, notify, onClose]);
  useEffect(() => { void load(); }, [load]);

  async function release() {
    if (!window.confirm('Liberar as cotas deste bolão agora, mesmo sem o prêmio ter atingido o gatilho?')) return;
    setBusy(true);
    try { await api(`/api/v1/admin/boloes/${id}/liberar`, { method: 'POST' }); notify('success', 'Cotas liberadas para venda.'); await load(); onChanged(); }
    catch (failure) { notify('error', failure instanceof Error ? failure.message : 'Não foi possível liberar.'); } finally { setBusy(false); }
  }

  if (!data) return <Panel title="Abrindo bolão…"><div className="admin-spinner" aria-label="Carregando" /></Panel>;
  const summary = data.resumo ?? {}; const gate = data.liberacao ?? {};
  const rows: Rec[] = (data.linhas ?? []).filter((row: Rec) => {
    if (filter === 'pagas') return row.statusPagamento === 'confirmado';
    if (filter === 'aguardando') return String(row.statusCota).startsWith('reservada');
    if (filter === 'canceladas') return ['cancelada', 'estornada'].includes(String(row.statusCota));
    return true;
  });
  return <Panel title={`${modalityNames[summary.modalidade] ?? summary.modalidade} · concurso ${summary.concurso}`} description={`${summary.grupo} · sorteio ${dateTime(summary.sorteio)} · cota ${brl(summary.valorCota)} · taxa de administração ${summary.taxaAdministracaoPct}%`} action={<div className="admin-row-actions"><ExportBar path={`/api/v1/admin/relatorios/boloes/${id}`} id={`bolao-${id.slice(0, 8)}`} small={false} onError={(text) => notify('error', text)} /><button className="admin-button admin-button-ghost" onClick={onClose}>Fechar</button></div>}>
    {gate.condicional && <div className={`admin-toast ${gate.liberado ? 'admin-toast-success' : 'admin-toast-error'}`} role="status" style={{ position: 'static', marginBottom: 14 }}><strong>{gate.liberado ? 'Cotas liberadas' : 'Bolão condicional: cotas bloqueadas'}</strong> — {gate.mensagem} {!gate.liberado && <><Progress value={gate.progressoPct} tone="amber" /><button className="admin-button admin-button-small" style={{ marginTop: 8 }} disabled={busy} onClick={() => void release()}>Liberar cotas agora (manual)</button></>}</div>}
    <div className="admin-kpi-grid">
      <Kpi label="Cotas pagas" value={summary.cotasPagas ?? 0} hint={summary.totalCotas ? `de ${summary.totalCotas} · ${summary.percentualVendido ?? 0}% vendido` : 'cotas ilimitadas'} tone="green" />
      <Kpi label="Aguardando pagamento" value={summary.cotasAguardando ?? 0} hint={summary.cotasLivres == null ? '' : `${summary.cotasLivres} cota(s) livres`} tone="amber" />
      <Kpi label="Participantes (pagos)" value={summary.participantesPagos ?? 0} tone="blue" />
      <Kpi label="Receita bruta" value={brl(summary.receitaBruta)} hint={`jogos ${brl(summary.custoJogos)} · taxa ${brl(summary.taxaAdministracao)}`} tone="violet" />
      <Kpi label="Fica com a plataforma" value={brl(Number(summary.taxaAdministracao ?? 0) - Number(summary.comissoes ?? 0))} hint={`comissões de afiliados ${brl(summary.comissoes)}`} tone="rose" />
    </div>
    <div className="admin-chip-row" role="tablist" aria-label="Filtro de participantes">{FILTERS.map(([key, title]) => <button key={key} role="tab" aria-selected={filter === key} className={`admin-chip-button ${filter === key ? 'is-current' : ''}`} onClick={() => setFilter(key)}>{title}</button>)}</div>
    <Table minWidth={1100}><thead><tr><th>Participante</th><th>CPF</th><th>Contato</th><th>Cotas</th><th>Valor</th><th>Cota</th><th>Pagamento</th><th>Forma</th><th>Pago em</th><th>Afiliado</th></tr></thead><tbody>{rows.map((row, index) => <tr key={index}><td><strong>{row.participante}</strong></td><td>{row.cpf}</td><td>{row.telefone ?? '—'}<small>{row.email}</small></td><td>{row.quantidade}</td><td>{brl(row.valorTotal)}</td><td><span className={chip(row.statusCota)}>{label(row.statusCota)}</span></td><td><span className={chip(row.statusPagamento)}>{label(row.statusPagamento)}</span></td><td>{label(row.metodo)}</td><td>{dateTime(row.pagoEm)}</td><td>{row.afiliado ?? '—'}</td></tr>)}</tbody></Table>
    {!rows.length && <Empty text="Nenhum participante neste filtro" />}
    <p className="admin-help" style={{ marginTop: 12 }}>O PDF é uma ficha pronta para imprimir (CPF protegido). A planilha e o CSV trazem todos os campos, inclusive o CPF completo, e cada exportação fica registrada na auditoria.</p>
  </Panel>;
}
