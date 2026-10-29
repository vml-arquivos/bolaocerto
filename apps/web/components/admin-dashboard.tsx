'use client';

import { FormEvent, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AdminUserEditor } from './admin-user-editor';
import { AdminShell } from './admin-shell';
import { AdminGroupForm, AffiliateNetworkTable, InviteManager, ManagedUserForm } from './admin-people-tools';
import { PoolWizard as SimplePoolWizard } from './pool-wizard';
import { CrmView, PoolControlView } from './admin-crm-tools';
import { HealthPanel } from './admin-health';
import { AdminModal, AttachmentsPanel, RegisterBetDialog } from './admin-attachments';
import { ConnectionsView } from './admin-connections';
import { CaixaDiagnosticsPanel, InvoicesView, ManualContestForm, ManualSaleForm, PaymentSettingsPanel, ReportsView, ShareActions } from './admin-finance-tools';

type RecordValue = Record<string, any>;
type PagePayload = { items?: RecordValue[]; pagination?: { page: number; pageSize: number; total: number; pages: number } };
type DashboardPayload = { kpis: RecordValue; graficos?: { recebimentos?: RecordValue[] }; proximosCutoffs?: RecordValue[] };

type GameDraft = { ordem: number; numeros: number[]; custo: string };
type ToastState = { type: 'success' | 'error'; text: string } | null;

const modalityNames: Record<string, string> = {
  megasena: 'Mega-Sena',
  lotofacil: 'Lotofácil',
  quina: 'Quina',
  lotomania: 'Lotomania',
  duplasena: 'Dupla Sena',
  timemania: 'Timemania',
  diadesorte: 'Dia de Sorte',
  supersete: 'Super Sete',
  loteca: 'Loteca',
};

const modalityLimits: Record<string, { max: number; min: number; pick: number }> = {
  megasena: { max: 60, min: 6, pick: 6 },
  lotofacil: { max: 25, min: 15, pick: 15 },
  quina: { max: 80, min: 5, pick: 5 },
  lotomania: { max: 100, min: 50, pick: 50 },
  duplasena: { max: 50, min: 6, pick: 6 },
  timemania: { max: 80, min: 10, pick: 10 },
  diadesorte: { max: 31, min: 7, pick: 7 },
  supersete: { max: 7, min: 7, pick: 7 },
  loteca: { max: 14, min: 1, pick: 1 },
};

// Telas que buscam os próprios dados (ou não precisam de lista): o painel não faz a busca genérica para elas.
const selfLoadingViews = new Set(['relatorios', 'notas-fiscais', 'conexoes', 'crm', 'controle', 'configuracoes']);
const viewsWithTables = new Set(['concursos', 'boloes', 'jogos', 'cotas', 'participantes', 'recebimentos', 'pagamentos', 'afiliados', 'comissoes', 'repasses', 'usuarios', 'operacao', 'comprovantes', 'lotericas', 'auditoria', 'grupos', 'rede', 'convites']);

function money(value: unknown) {
  const number = Number(value ?? 0);
  if (!Number.isFinite(number)) return 'R$ 0,00';
  return number.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
}

function dateTime(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });
}

function dateOnly(value: unknown) {
  if (!value) return '—';
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleDateString('pt-BR');
}

function statusLabel(status: unknown) {
  return String(status ?? '—').replaceAll('_', ' ').replaceAll('-', ' ');
}

function statusClass(status: unknown) {
  const normalized = String(status ?? '').toLowerCase();
  if (['paga', 'pago', 'confirmado', 'aprovado', 'registrado', 'apurado', 'ativo'].includes(normalized)) return 'status-chip status-success';
  if (['pendente', 'reservada', 'rascunho'].includes(normalized)) return 'status-chip status-warning';
  if (['falhou', 'cancelada', 'cancelado', 'reprovado', 'estornado', 'inativo'].includes(normalized)) return 'status-chip status-danger';
  if (['aberto', 'fechado'].includes(normalized)) return 'status-chip status-info';
  return 'status-chip';
}

async function authFetch(path: string, options?: RequestInit) {
  let response = await fetch(path, { ...options, credentials: 'include' });
  if (response.status === 401) {
    const refresh = await fetch('/api/v1/auth/refresh', { method: 'POST', credentials: 'include' });
    if (refresh.ok) response = await fetch(path, { ...options, credentials: 'include' });
  }
  return response;
}

async function fetchAdmin(path: string, options?: RequestInit) {
  const response = await authFetch(path, options);
  if (response.status === 401) {
    window.location.href = '/login?next=/admin';
    throw new Error('Sessão expirada.');
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(payload?.message) ? payload.message.join(' ') : payload?.message || 'Não foi possível carregar os dados.');
  return payload;
}

function SectionHeading({ eyebrow, title, description, action }: { eyebrow: string; title: string; description?: string; action?: React.ReactNode }) {
  return <div className="admin-page-heading"><div><span className="admin-eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{action}</div>;
}

function Kpi({ label, value, hint, tone = 'blue' }: { label: string; value: string | number; hint?: string; tone?: 'blue' | 'violet' | 'green' | 'amber' | 'rose' }) {
  return <article className={`admin-kpi admin-kpi-${tone}`}><span className="admin-kpi-icon" aria-hidden="true">{tone === 'green' ? '↗' : tone === 'amber' ? '!' : tone === 'rose' ? '◎' : tone === 'violet' ? '◆' : '◌'}</span><div><span>{label}</span><strong>{value}</strong>{hint && <small>{hint}</small>}</div></article>;
}

function Panel({ title, description, action, children, className = '' }: { title: string; description?: string; action?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return <section className={`admin-panel ${className}`}><div className="admin-panel-heading"><div><h2>{title}</h2>{description && <p>{description}</p>}</div>{action}</div>{children}</section>;
}

function Empty({ title, description }: { title: string; description: string }) {
  return <div className="admin-empty"><span>BL</span><strong>{title}</strong><p>{description}</p></div>;
}

function Table({ children, minWidth = 720 }: { children: React.ReactNode; minWidth?: number }) {
  return <div className="admin-table-scroll"><table className="admin-table" style={{ minWidth }}>{children}</table></div>;
}

function AdminDashboardContent({ testMode }: { testMode: boolean }) {
  const searchParams = useSearchParams();
  const view = searchParams.get('view') || 'visao-geral';
  const [dashboard, setDashboard] = useState<DashboardPayload | null>(null);
  const [payload, setPayload] = useState<PagePayload>({ items: [] });
  const [contests, setContests] = useState<RecordValue[]>([]);
  const [groupId, setGroupId] = useState<string | null>(null);
  const [affiliateOptions, setAffiliateOptions] = useState<RecordValue[]>([]);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [period, setPeriod] = useState('30d');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [contestScope, setContestScope] = useState<'aberto' | 'historico'>('aberto');
  const [page, setPage] = useState(1);
  const [selectedCommissions, setSelectedCommissions] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [editingPool, setEditingPool] = useState<RecordValue | null>(null);
  const [attachFor, setAttachFor] = useState<{ pool: RecordValue; share?: RecordValue } | null>(null);

  const [showPoolForm, setShowPoolForm] = useState(false);
  const [updatedAt, setUpdatedAt] = useState<Date | null>(null);
  const requestSequence = useRef(0);
  const load = useCallback(async (quiet = false) => {
    const sequence = ++requestSequence.current;
    if (!quiet) setLoading(true);
    try {
      if (selfLoadingViews.has(view)) { setLoading(false); return; }
      // A Visão geral só aceita o período; as listas aceitam paginação, busca e status (a API recusa parâmetros desconhecidos).
      const query = view === 'visao-geral' ? new URLSearchParams({ periodo: period }) : new URLSearchParams({ page: String(page), pageSize: view === 'concursos' ? '30' : '50' });
      if (view !== 'visao-geral') {
        if (search) query.set('busca', search);
        if (view === 'concursos') query.set('status', contestScope);
        else if (statusFilter) query.set('status', statusFilter);
      }
      const endpointView = view === 'participantes' ? 'cotas' : view === 'pagamentos' ? 'recebimentos' : view === 'jogos' ? 'boloes' : view === 'comprovantes' ? 'operacao' : view === 'rede' ? 'afiliados' : view;
      const endpoint = view === 'visao-geral' ? `/api/v1/admin/dashboard?${query.toString()}` : `/api/v1/admin/${endpointView}?${query.toString()}`;
      const result = await fetchAdmin(endpoint);
      if (sequence !== requestSequence.current) return;
      setUpdatedAt(new Date());
      if (view === 'visao-geral') setDashboard(result);
      else setPayload(result);
      if (view === 'visao-geral' || view === 'boloes') {
        const [contestPayload, group] = await Promise.all([fetchAdmin('/api/v1/admin/concursos?page=1&pageSize=100&status=aberto'), fetch('/api/v1/grupos/bl-oficial').then((response) => response.ok ? response.json() : null)]);
        setContests(contestPayload.items ?? []);
        setGroupId(group?.id ?? null);
      }
      if (['afiliados', 'rede', 'convites', 'grupos'].includes(view)) {
        const affiliatePayload = await fetchAdmin('/api/v1/admin/afiliados?page=1&pageSize=100');
        setAffiliateOptions(affiliatePayload.items ?? []);
      }
    } catch (error) {
      setToast({ type: 'error', text: error instanceof Error ? error.message : 'Falha ao carregar o painel.' });
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [contestScope, page, period, search, statusFilter, view]);

  useEffect(() => { setPage(1); }, [view, contestScope, statusFilter, search]);
  useEffect(() => { void load(); return () => { requestSequence.current++; }; }, [load]);
  useEffect(() => {
    const refresh = () => { if (['visao-geral', 'boloes', 'cotas', 'participantes', 'pagamentos', 'recebimentos'].includes(view) && !busy && !editingPool && !attachFor && !showPoolForm && document.visibilityState === 'visible') void load(true); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [load, busy, editingPool, attachFor, showPoolForm, view]);
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(null), 5000); return () => window.clearTimeout(timeout); }, [toast]);

  const items = payload.items ?? [];
  const kpis = dashboard?.kpis ?? {};
  const chart = dashboard?.graficos?.recebimentos ?? [];
  const chartMax = Math.max(...chart.map((row) => Number(row.valor ?? 0)), 1);

  async function execute(path: string, options: RequestInit, success: string) {
    setBusy(true);
    try {
      await fetchAdmin(path, options);
      setToast({ type: 'success', text: success });
      await load();
    } catch (error) {
      setToast({ type: 'error', text: error instanceof Error ? error.message : 'Não deu certo. Tente de novo.' });
    } finally {
      setBusy(false);
    }
  }

  function notify(type: 'success' | 'error', text: string) { setToast({ type, text }); }

  async function syncContests() {
    setBusy(true);
    try {
      const result = await fetchAdmin('/api/v1/admin/concursos/sincronizar', { method: 'POST' });
      const falhas: Array<{ modalidade: string }> = Array.isArray(result?.falhas) ? result.falhas : [];
      setToast(falhas.length
        ? { type: 'error', text: `${result?.sincronizados ?? 0} modalidade(s) sincronizada(s); falhou: ${falhas.map((item) => item.modalidade).join(', ')}. Use “Testar conexão com a CAIXA” para ver o motivo.` }
        : { type: 'success', text: 'Concursos sincronizados com sucesso.' });
      await load();
    } catch (error) {
      setToast({ type: 'error', text: error instanceof Error ? error.message : 'Não deu certo. Tente de novo.' });
    } finally {
      setBusy(false);
    }
  }

  async function importHistory() {
    setBusy(true);
    try {
      const result = await fetchAdmin('/api/v1/admin/estatisticas/historico?limite=30', { method: 'POST' });
      const rows: Array<{ modalidade: string; importados: number; faltando: number; erro?: string }> = Array.isArray(result?.relatorio) ? result.relatorio : [];
      const imported = rows.reduce((sum, row) => sum + row.importados, 0);
      const remaining = rows.reduce((sum, row) => sum + Math.max(0, row.faltando - row.importados), 0);
      const errors = rows.filter((row) => row.erro);
      setToast(errors.length && imported === 0
        ? { type: 'error', text: errors[0]?.erro ?? 'Não foi possível importar o histórico.' }
        : { type: 'success', text: `${imported} sorteio(s) antigo(s) trazido(s). ${remaining > 0 ? `Faltam cerca de ${remaining}; clique de novo ou aguarde, o sistema continua sozinho.` : 'Tudo certo, nada mais para buscar.'}` });
    } catch (error) {
      setToast({ type: 'error', text: error instanceof Error ? error.message : 'Não foi possível importar o histórico.' });
    } finally {
      setBusy(false);
    }
  }

  function DashboardView() {
    return <>
      <SectionHeading eyebrow="Início" title="Resumo" description="Como estão as coisas hoje." action={<div className="admin-heading-actions"><select value={period} onChange={(event) => setPeriod(event.target.value)} aria-label="Período"><option value="hoje">Hoje</option><option value="7d">Últimos 7 dias</option><option value="30d">Últimos 30 dias</option><option value="mes">Este mês</option></select><button className="admin-button admin-button-primary" onClick={syncContests} disabled={busy}>Atualizar sorteios</button></div>} />
      <HealthPanel />
      <div className="admin-kpi-grid"><Kpi label="Usuários" value={kpis.usuarios ?? 0} hint="contas cadastradas" /><Kpi label="Bolões abertos" value={kpis.boloesAbertos ?? 0} hint={`${kpis.boloesFechados ?? 0} fechados`} tone="violet" /><Kpi label="Cotas pagas" value={kpis.cotasPagas ?? 0} hint={`${kpis.cotasReservadas ?? 0} reservadas`} tone="green" /><Kpi label="Arrecadação" value={money(kpis.arrecadacao)} hint="período selecionado" tone="amber" /><Kpi label="Comissões pendentes" value={money(kpis.comissoesPendentes)} hint={`${kpis.afiliadosAtivos ?? 0} afiliados ativos`} tone="rose" /></div>
      <div className="admin-dashboard-grid">
        <Panel title="Quanto entrou" description="Pagamentos confirmados" className="admin-panel-chart"><div className="admin-chart">{chart.length ? chart.slice(-14).map((row) => <div className="admin-chart-column" key={row.data}><span>{money(row.valor)}</span><div style={{ height: `${Math.max(8, (Number(row.valor ?? 0) / chartMax) * 100)}%` }} /><small>{String(row.data).slice(5).replace('-', '/')}</small></div>) : <Empty title="Ainda sem pagamentos" description="Quando alguém pagar, aparece aqui." />}</div></Panel>
        <Panel title="Fecham em breve" description="Bolões perto do prazo" action={<Link href="/admin?view=operacao" className="admin-text-link">Ver todos</Link>}><div className="admin-list">{(dashboard?.proximosCutoffs ?? []).length ? dashboard!.proximosCutoffs!.map((row) => <div className="admin-list-row" key={row.id}><div><strong>{modalityNames[row.modalidade] ?? row.modalidade} · concurso {row.concurso}</strong><span>{row.cotas ?? 0} cotas registradas</span></div><time>{dateTime(row.cutoffAt)}</time></div>) : <Empty title="Nada por enquanto" description="Nenhum bolão perto do prazo." />}</div></Panel>
      </div>
      <div className="admin-dashboard-grid admin-dashboard-grid-three"><Panel title="Seus bolões" description="Em que etapa estão"><div className="admin-summary-list"><div><span>Rascunhos</span><strong>{kpis.boloesRascunho ?? 0}</strong></div><div><span>Abertos</span><strong>{kpis.boloesAbertos ?? 0}</strong></div><div><span>Apostados</span><strong>{kpis.boloesRegistrados ?? 0}</strong></div><div><span>Apurados</span><strong>{kpis.boloesApurados ?? 0}</strong></div></div></Panel><Panel title="Cotas" description="Livres e vendidas"><div className="admin-summary-list"><div><span>Disponíveis</span><strong>{kpis.cotasDisponiveis ?? 0}</strong></div><div><span>Reservadas</span><strong>{kpis.cotasReservadas ?? 0}</strong></div><div><span>Pagas</span><strong>{kpis.cotasPagas ?? 0}</strong></div><div><span>Premiadas</span><strong>{kpis.cotasPremiadas ?? 0}</strong></div></div></Panel><Panel title="Em dinheiro" description="Valores confirmados"><div className="admin-summary-list"><div><span>Gasto nas apostas</span><strong>{money(kpis.custoJogos)}</strong></div><div><span>Sua taxa</span><strong>{money(kpis.taxasAdministrativas)}</strong></div><div><span>Comissões pagas</span><strong>{money(kpis.comissoesPagas)}</strong></div><div><span>Para fazer</span><strong>{kpis.filaOperacional ?? 0}</strong></div></div></Panel></div>
    </>;
  }

  function ContestsView() {
    return <><SectionHeading eyebrow="Jogos" title="Concursos" description="Sorteios e prêmios estimados." action={<div className="admin-row-actions"><button className="admin-button admin-button-ghost" onClick={importHistory} disabled={busy} title="Baixa sorteios antigos da CAIXA para alimentar as estatísticas (30 por modalidade por clique)">Buscar sorteios antigos</button><button className="admin-button admin-button-primary" onClick={syncContests} disabled={busy}>Atualizar agora</button></div>} /><div style={{ marginBottom: 16 }}><CaixaDiagnosticsPanel /></div><div style={{ marginBottom: 16 }}><ManualContestForm onDone={load} notify={notify} /></div><div className="report-tabs" role="tablist" aria-label="Escopo dos concursos"><button role="tab" aria-selected={contestScope === 'aberto'} className={`report-tab ${contestScope === 'aberto' ? 'is-current' : ''}`} onClick={() => setContestScope('aberto')}>Em aberto</button><button role="tab" aria-selected={contestScope === 'historico'} className={`report-tab ${contestScope === 'historico' ? 'is-current' : ''}`} onClick={() => setContestScope('historico')}>Histórico</button></div><Panel title={contestScope === 'aberto' ? 'Concursos em aberto' : 'Histórico de concursos'} description={`${payload.pagination?.total ?? items.length} registros — ${contestScope === 'aberto' ? 'apenas concursos com prazo de apostas no futuro, do mais próximo ao mais distante' : 'concursos encerrados, do mais recente ao mais antigo'}`}><Table minWidth={980}><thead><tr><th>Modalidade</th><th>Concurso</th><th>Sorteio</th><th>Prêmio estimado</th><th>Status</th><th>Bolões</th><th>Sincronizado</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{modalityNames[item.modalidade] ?? item.modalidade}</strong></td><td>#{item.numeroConcurso}</td><td>{dateOnly(item.dataSorteio)}</td><td>{money(item.valorEstimadoPremio)}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td>{item._count?.boloes ?? 0}</td><td>{dateTime(item.sincronizadoEm)}</td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum concurso encontrado" description={contestScope === 'aberto' ? 'Sincronize a base da CAIXA ou cadastre o concurso manualmente.' : 'Ainda não há concursos encerrados.'} />}{(payload.pagination?.pages ?? 1) > 1 && <div className="admin-heading-actions" style={{ justifyContent: 'space-between', marginTop: 14 }}><button className="admin-button admin-button-ghost" disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>← Mais recentes</button><span style={{ opacity: .75, fontSize: 13 }}>Página {payload.pagination?.page} de {payload.pagination?.pages}</span><button className="admin-button admin-button-ghost" disabled={page >= (payload.pagination?.pages ?? 1)} onClick={() => setPage((current) => current + 1)}>Mais antigos →</button></div>}</Panel></>;
  }

  function PoolsView() {
    return <><SectionHeading eyebrow="Jogos" title="Bolões" description="Gerencie vendas, jogos e comprovantes por lote." action={<button className="admin-button" onClick={() => setShowPoolForm(value => !value)}>{showPoolForm ? 'Recolher formulário' : '+ Novo bolão'}</button>} /><div className="admin-mini-stats"><span>Total <strong>{items.length}</strong></span><span>Rascunhos <strong>{items.filter((item) => item.status === 'rascunho').length}</strong></span><span>Abertos <strong>{items.filter((item) => item.status === 'aberto').length}</strong></span><span>Fechados <strong>{items.filter((item) => item.status === 'fechado').length}</strong></span></div>{(showPoolForm || editingPool) && <Panel title={editingPool ? "Editar bolão" : "Criar bolão"} description="Escolha o concurso, os números e o valor."><SimplePoolWizard contests={contests} groupId={groupId} editPool={editingPool} onCancelEdit={() => setEditingPool(null)} onSuccess={async () => { setEditingPool(null); setShowPoolForm(false); await load(); }} /></Panel>}<Panel className="admin-pools-compact" title="Bolões cadastrados" description="Dados desta página. Novos lotes exigem comprovante antes de publicar; cotas e pagamentos antigos permanecem no histórico."><Table minWidth={980}><thead><tr><th>Modalidade</th><th>Concurso</th><th>Jogos</th><th>Cotas</th><th>Reservadas</th><th>Pagas</th><th>Disponíveis</th><th>Valor cota</th><th>Receita prevista</th><th>Fecha em</th><th>Status</th><th>Ações</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{modalityNames[item.concurso?.modalidade] ?? item.concurso?.modalidade ?? '—'}</td><td>#{item.concurso?.numeroConcurso ?? '—'}</td><td>{item.indicadores?.jogos ?? item.jogos?.length ?? 0}</td><td>{item.cotasIlimitadas ? 'Ilimitadas' : item.totalCotas ?? 0}</td><td>{item.indicadores?.reservadas ?? 0}</td><td>{item.indicadores?.pagas ?? 0}</td><td><strong>{item.cotasIlimitadas ? 'Ilimitadas' : item.indicadores?.disponiveis ?? 0}</strong></td><td>{money(item.valorCota)}</td><td>{money(item.indicadores?.receitaPrevista)}</td><td>{dateTime(item.concurso?.cutoffAt)}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span>{item.liberacao?.condicional && <small>{item.liberacao.liberado ? 'cotas liberadas' : `libera com prêmio de ${money(item.liberacao.gatilho)}`}{!item.liberacao.liberado && Number(item.indicadores?.interessados) > 0 ? ` · ${item.indicadores.interessados} pediram aviso` : ''}</small>}</td><td><div className="admin-row-actions"><Link className="admin-text-link" href={`/boloes/${item.id}`}>Ver</Link><button className="admin-text-button" onClick={() => setAttachFor({ pool: item })}>Comprovantes</button><Link className="admin-text-link" href="/admin?view=controle">Controle de cotas</Link>{item.liberacao?.condicional && !item.liberacao.liberado && ['aberto', 'rascunho'].includes(item.status) && <button className="admin-button admin-button-small admin-button-ghost" onClick={() => { if (window.confirm('Liberar as cotas deste bolão agora, sem esperar o prêmio atingir o gatilho?')) void execute(`/api/v1/admin/boloes/${item.id}/liberar`, { method: 'POST' }, 'Cotas liberadas.'); }}>Liberar cotas</button>}{['rascunho', 'aberto'].includes(item.status) && <button className="admin-button admin-button-small admin-button-ghost" onClick={() => setEditingPool(item)}>Editar</button>}<button className="admin-button admin-button-small admin-button-ghost" onClick={() => execute(`/api/v1/admin/boloes/${item.id}/duplicar`, { method: 'POST' }, 'Novo lote criado como rascunho. Revise os jogos e publique.')}>Novo lote</button>{item.status === 'rascunho' && <button className="admin-button admin-button-small" onClick={() => execute(`/api/v1/admin/boloes/${item.id}/publicar`, { method: 'POST' }, 'Bolão publicado.')}>Publicar</button>}{item.status === 'aberto' && <button className="admin-button admin-button-small" onClick={() => execute(`/api/v1/admin/boloes/${item.id}/fechar`, { method: 'POST' }, 'Bolão fechado.')}>Fechar</button>}{!['registrado', 'apurado'].includes(item.status) && <button disabled={busy} className="admin-text-button admin-danger" onClick={() => { if (window.confirm('Excluir definitivamente este bolão sem movimentação? O sistema bloqueia a exclusão se houver qualquer cota ou anexo.')) void execute(`/api/v1/admin/boloes/${item.id}/sem-movimentacao`, { method: 'DELETE' }, 'Bolão excluído.'); }}>Excluir</button>}{!['registrado', 'apurado', 'cancelado'].includes(item.status) && <button className="admin-text-button" onClick={() => { if (window.confirm('Cancelar este bolão?')) void execute(`/api/v1/admin/boloes/${item.id}`, { method: 'DELETE' }, 'Bolão cancelado.'); }}>Cancelar</button>}</div></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum bolão cadastrado" description="Use a criação rápida acima para cadastrar o primeiro bolão." />}</Panel></>;
  }

  function SharesView() {
    return <><SectionHeading eyebrow="Jogos" title="Cotas" description="Quem reservou e quem pagou." /><div style={{ marginBottom: 16 }}><ManualSaleForm onDone={load} notify={notify} /></div><Panel title="Cotas e reservas"><Table minWidth={1320}><thead><tr><th>Titular</th><th>Bolão</th><th>Concurso</th><th>Quantidade</th><th>Valor</th><th>Status</th><th>Afiliado</th><th>Reserva</th><th>Pagamento</th><th>Ações</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.titularNome}</strong><small>{item.titularCpf}</small></td><td>{item.bolao?.id?.slice(0, 8) ?? '—'}</td><td>{item.bolao?.concurso?.numeroConcurso ?? '—'}</td><td>{item.quantidade}</td><td>{money(item.valorPago)}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td>{item.afiliadoReferencia?.codigoAfiliado ?? 'Orgânico'}</td><td>{dateTime(item.expiraReservaEm)}</td><td>{item.pagamento ? <span className={statusClass(item.pagamento.status)}>{statusLabel(item.pagamento.status)}</span> : '—'}</td><td><div className="admin-row-actions"><ShareActions item={item} onDone={load} notify={notify} />{item.bolao?.id && <button className="admin-button admin-button-small admin-button-ghost" onClick={() => setAttachFor({ pool: { id: item.bolao.id, modalidade: item.bolao.concurso?.modalidade, concurso: item.bolao.concurso?.numeroConcurso, status: item.bolao.status }, share: item })}>Recibo</button>}</div></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhuma cota encontrada" description="As reservas e pagamentos aparecerão nesta fila assim que existirem." />}</Panel></>;
  }

  function PaymentsView() {
    const title = view === 'pagamentos' ? 'Pagamentos' : 'Recebimentos';
    return <><SectionHeading eyebrow="Financeiro" title={title} description="Pix e boleto, e o que foi pago na mão." /><div className="admin-kpi-grid admin-kpi-grid-four"><Kpi label="Confirmados" value={items.filter((item) => item.status === 'confirmado').length} tone="green" /><Kpi label="Pendentes" value={items.filter((item) => item.status === 'pendente').length} tone="amber" /><Kpi label="Falhos" value={items.filter((item) => item.status === 'falhou').length} tone="rose" /><Kpi label="Estornados" value={items.filter((item) => item.status === 'estornado').length} /></div><Panel title="Transações"><Table minWidth={1220}><thead><tr><th>Data</th><th>Transação</th><th>Usuário</th><th>Cota</th><th>Método</th><th>Valor</th><th>Taxa</th><th>Comissão</th><th>Provedor</th><th>Vencimento</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{dateTime(item.criadoEm)}</td><td><code>{item.pspTransactionId ?? item.id?.slice(0, 8)}</code></td><td>{item.cota?.comprador?.nome ?? '—'}</td><td>{item.cotaId?.slice(0, 8)}</td><td>{statusLabel(item.metodo ?? 'pix')}</td><td>{money(item.valorBruto)}</td><td>{money(item.valorTaxaAdmin)}</td><td>{money(item.valorComissaoAfiliado)}</td><td>{item.pspProvedor}</td><td>{dateTime(item.vencimentoEm)}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum recebimento" description="As cobranças Pix e boleto aparecerão após a criação de pagamentos." />}</Panel></>;
  }

  function GamesView() {
    const games = items.flatMap((pool) => (pool.jogos ?? []).map((game: RecordValue) => ({ ...game, pool })));
    return <><SectionHeading eyebrow="Jogos" title="Apostas" description="Os jogos de cada bolão." /><Panel title="Jogos cadastrados" description={`${games.length} jogos carregados nos bolões filtrados`}><Table minWidth={980}><thead><tr><th>Bolão</th><th>Modalidade</th><th>Concurso</th><th>Ordem</th><th>Números</th><th>Dezenas</th><th>Custo</th><th>Status</th></tr></thead><tbody>{games.map((game) => <tr key={game.id}><td><code>{game.pool.id?.slice(0, 8)}</code></td><td>{modalityNames[game.pool.concurso?.modalidade] ?? game.pool.concurso?.modalidade ?? '—'}</td><td>#{game.pool.concurso?.numeroConcurso ?? '—'}</td><td>Jogo {String(game.ordem).padStart(3, '0')}</td><td><strong>{(game.numeros ?? []).map((number: number) => String(number).padStart(2, '0')).join(' · ') || game.pool.numerosApostados?.join(' · ') || '—'}</strong></td><td>{game.quantidadeDezenas ?? game.numeros?.length ?? 0}</td><td>{money(game.custo)}</td><td><span className={statusClass(game.status)}>{statusLabel(game.status)}</span></td></tr>)}</tbody></Table>{!games.length && <Empty title="Nenhum jogo carregado" description="Crie um bolão com vários jogos para vê-los aqui." />}</Panel></>;
  }

  function ParticipantsView() {
    return <><SectionHeading eyebrow="Pessoas" title="Participantes" description="Quem tem cotas nos bolões." /><Panel title="Participantes e cotas"><Table minWidth={900}><thead><tr><th>Participante</th><th>CPF protegido</th><th>Cotas</th><th>Bolão</th><th>Valor</th><th>Status</th><th>Afiliado</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.titularNome}</strong><small>{item.comprador?.email ?? '—'}</small></td><td>{item.titularCpf}</td><td>{item.quantidade}</td><td><code>{item.bolao?.id?.slice(0, 8) ?? '—'}</code></td><td>{money(item.valorPago)}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td>{item.afiliadoReferencia?.codigoAfiliado ?? 'Orgânico'}</td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum participante encontrado" description="As participações aparecerão aqui com paginação e filtros." />}</Panel></>;
  }

  function ReceiptsView() {
    return <><SectionHeading eyebrow="Dia a dia" title="Comprovantes" description="Comprovantes das apostas feitas." /><Panel title="Comprovantes de bolão"><Table minWidth={980}><thead><tr><th>Modalidade</th><th>Concurso</th><th>Jogos</th><th>Cotas pagas</th><th>Fecha em</th><th>Status</th><th>Comprovante</th><th>Ação</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{modalityNames[item.modalidade] ?? item.modalidade}</td><td>#{item.concurso}</td><td>{item.jogos}</td><td>{item.cotasPagas}</td><td>{dateTime(item.cutoffAt)}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td>{item.comprovanteUrl ? <a className="admin-text-link" href={item.comprovanteUrl} target="_blank" rel="noreferrer">Abrir</a> : 'Pendente'}</td><td><button className="admin-button admin-button-small" onClick={() => setAttachFor({ pool: item })}>Arquivos</button></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum comprovante" description="Comprovantes vinculados ou pendentes aparecerão nesta fila." />}</Panel></>;
  }

  function AffiliatesView() {
    return <><SectionHeading eyebrow="Indicações" title="Afiliados" description="Quem indica clientes e quanto ganha." /><div className="admin-management-grid"><ManagedUserForm mode="affiliate" affiliates={affiliateOptions as any} onDone={load} onNotice={(text) => setToast({ type: 'success', text })} /><InviteManager affiliates={affiliateOptions as any} onDone={load} onNotice={(text) => setToast({ type: 'success', text })} /></div><Panel title="Afiliados cadastrados"><Table minWidth={1240}><thead><tr><th>Afiliado</th><th>Código</th><th>Status</th><th>Pai</th><th>Diretos</th><th>Usuários</th><th>Grupos</th><th>Cotas</th><th>Comissão</th><th>Pendente</th><th>Pago</th><th>Ações</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.usuario?.nome}</strong><small>{item.usuario?.email}</small></td><td><code>{item.codigoAfiliado}</code></td><td><span className={statusClass(item.statusAprovacao)}>{statusLabel(item.statusAprovacao)}</span></td><td>{item.parentAfiliado?.usuario?.nome ?? 'Raiz'}</td><td>{item.indicadores?.indicados ?? 0}</td><td>{item.indicadores?.usuariosIndicados ?? 0}</td><td>{item.indicadores?.grupos ?? 0}</td><td>{item.indicadores?.cotas ?? 0}</td><td>{item.comissaoPadraoPct}%</td><td>{money(item.indicadores?.pendente)}</td><td>{money(item.indicadores?.paga)}</td><td><div className="admin-row-actions">{item.statusAprovacao !== 'aprovado' && <button className="admin-button admin-button-small" onClick={() => execute(`/api/v1/admin/afiliados/${item.id}/aprovar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comissaoPadraoPct: Number(item.comissaoPadraoPct ?? 10) }) }, 'Afiliado aprovado e papel atualizado.')}>Aprovar</button>}<button className="admin-button admin-button-small admin-button-ghost" onClick={() => { const value = window.prompt('Nova comissão percentual:', String(item.comissaoPadraoPct ?? 10)); if (value !== null) void execute(`/api/v1/admin/afiliados/${item.id}/comissao`, { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comissaoPadraoPct: Number(value) }) }, 'Comissão atualizada.'); }}>Alterar %</button></div></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum afiliado" description="Crie um afiliado ou gere um convite para iniciar a rede." />}</Panel></>;
  }

  function NetworkView() {
    return <><SectionHeading eyebrow="Indicações" title="Quem indicou quem" description="Veja e ajuste a ordem das indicações." /><Panel title="Indicações"><AffiliateNetworkTable affiliates={items as any} onDone={load} onNotice={(text) => setToast({ type: 'success', text })} /></Panel></>;
  }

  function InvitesView() {
    return <><SectionHeading eyebrow="Indicações" title="Convites" description="Crie links para chamar pessoas." /><InviteManager affiliates={affiliateOptions as any} onDone={load} onNotice={(text) => setToast({ type: 'success', text })} /><Panel title="Convites emitidos"><Table minWidth={900}><thead><tr><th>Código</th><th>Tipo</th><th>Origem</th><th>Destino</th><th>Status</th><th>Expiração</th><th>Link</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><code>{item.codigo}</code></td><td>{item.tipo === 'afiliado' ? 'Afiliado' : 'Usuário'}</td><td>{item.afiliadoOrigem?.codigoAfiliado ?? 'Raiz'}</td><td>{item.emailDestino ?? 'Livre'}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td>{dateTime(item.expiraEm)}</td><td>{item.caminho ? <button className="admin-text-button" onClick={() => navigator.clipboard.writeText(`${window.location.origin}${item.caminho}`)}>Copiar link</button> : '—'}</td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum convite" description="Gere um link acima para iniciar aquisição rastreável." />}</Panel></>;
  }

  function GroupsView() {
    return <><SectionHeading eyebrow="Pessoas" title="Grupos" description="Grupos do BL e dos afiliados." /><Panel title="Novo grupo"><AdminGroupForm affiliates={affiliateOptions as any} onDone={load} onNotice={(text) => setToast({ type: 'success', text })} /></Panel><Panel title="Grupos cadastrados"><Table minWidth={850}><thead><tr><th>Grupo</th><th>Slug</th><th>Proprietário</th><th>Bolões</th><th>Criado em</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.nome}</strong><small>{item.descricao ?? 'Sem descrição'}</small></td><td><code>/{item.slug}</code></td><td>{item.afiliado?.usuario?.nome ?? 'BL oficial'}</td><td>{item._count?.boloes ?? 0}</td><td>{dateOnly(item.criadoEm)}</td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum grupo" description="Crie o primeiro grupo oficial ou de afiliado." />}</Panel></>;
  }

  function CommissionsView() {
    const toggle = (id: string) => setSelectedCommissions((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
    return <><SectionHeading eyebrow="Dinheiro" title="Comissões" description="Só aparecem depois que o pagamento é confirmado." action={<Link href="/admin?view=repasses" className="admin-button admin-button-primary">Pagar comissões</Link>} /><Panel title="Comissões pendentes e pagas" action={selectedCommissions.length > 0 ? <button className="admin-button admin-button-primary" onClick={() => execute('/api/v1/admin/repasses', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ comissaoIds: selectedCommissions }) }, 'Lote de repasse criado.')}>Criar lote ({selectedCommissions.length})</button> : undefined}><Table minWidth={1120}><thead><tr><th><input type="checkbox" aria-label="Selecionar todas" onChange={(event) => setSelectedCommissions(event.target.checked ? items.filter((item) => item.status === 'pendente').map((item) => item.id) : [])} /></th><th>Afiliado</th><th>Cota</th><th>Bolão</th><th>Base</th><th>%</th><th>Comissão</th><th>Status</th><th>Data</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><input type="checkbox" checked={selectedCommissions.includes(item.id)} disabled={item.status !== 'pendente'} onChange={() => toggle(item.id)} aria-label={`Selecionar comissão ${item.id}`} /></td><td>{item.afiliado?.usuario?.nome ?? item.afiliado?.codigoAfiliado}</td><td>{item.cotaId?.slice(0, 8)}</td><td>{item.cota?.bolao?.concurso?.numeroConcurso ? `Concurso ${item.cota.bolao.concurso.numeroConcurso}` : '—'}</td><td>{money(item.baseCalculo)}</td><td>{item.percentual ?? '—'}%</td><td>{money(item.valor)}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td>{dateTime(item.criadoEm)}</td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhuma comissão" description="As comissões serão geradas quando uma cota atribuída for paga." />}</Panel></>;
  }

  function RemittancesView() {
    return <><SectionHeading eyebrow="Dinheiro" title="Pagar comissões" description="Junte comissões e registre o Pix enviado." /><Panel title="Pagamentos de comissão"><Table minWidth={980}><thead><tr><th>Código</th><th>Comissões</th><th>Valor total</th><th>Data</th><th>Referência</th><th>Status</th><th>Ação</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><code>{item.codigo}</code></td><td>{item.comissoes?.length ?? 0}</td><td>{money(item.valorTotal)}</td><td>{dateOnly(item.dataRepasse)}</td><td>{item.referencia ?? '—'}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td>{item.status !== 'pago' && <button className="admin-button admin-button-small" onClick={() => execute(`/api/v1/admin/repasses/${item.id}/pagar`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ referencia: window.prompt('Referência do comprovante:', '') || undefined }) }, 'Repasse marcado como pago e comissões atualizadas.')}>Registrar pagamento</button>}</td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum lote de repasse" description="Selecione comissões pendentes na aba Comissões para gerar um lote." />}</Panel></>;
  }

  function UsersView() {
    return <><SectionHeading eyebrow="Gestão de pessoas" title="Usuários, equipe e acessos" description="Quem tem conta e o que pode fazer." /><ManagedUserForm mode="user" onDone={load} onNotice={(text) => setToast({ type: 'success', text })} /><Panel title="Contas cadastradas"><Table minWidth={1120}><thead><tr><th>Usuário</th><th>CPF</th><th>Papel</th><th>Afiliado</th><th>Verificação</th><th>Cadastro</th><th>Participações</th><th>Ações</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.nome}</strong><small>{item.email}</small></td><td>{item.cpf}</td><td><span className="status-chip">{item.papel}</span><small>{item.desativadoEm ? 'Acesso removido' : 'Ativo'}</small></td><td>{item.afiliado?.codigoAfiliado ?? '—'}</td><td><span className={statusClass(item.statusKyc)}>{statusLabel(item.statusKyc)}</span></td><td>{dateOnly(item.criadoEm)}</td><td>{item._count?.cotasCompradas ?? 0}</td><td><button className="admin-button admin-button-small" onClick={() => setSelectedUser(item.id)}>Editar / acessos / excluir</button></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum usuário" description="Use o cadastro interno acima ou o link de convite." />}</Panel></>;
  }

  function OperationView() {
    return <><SectionHeading eyebrow="Dia a dia" title="Para fazer" description="Bolões que precisam ser apostados ou ter comprovante." /><Panel title="Bolões para apostar"><Table minWidth={1120}><thead><tr><th>Modalidade</th><th>Concurso</th><th>Jogos</th><th>Cotas pagas</th><th>Arrecadação</th><th>Fecha em</th><th>Parceiro</th><th>Status</th><th>Ação</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{modalityNames[item.modalidade] ?? item.modalidade}</td><td>#{item.concurso}</td><td>{item.jogos}</td><td>{item.cotasPagas}</td><td>{money(item.arrecadacao)}</td><td>{dateTime(item.cutoffAt)}</td><td>{item.parceiro ?? 'Mandato'}</td><td><span className={statusClass(item.status)}>{statusLabel(item.status)}</span></td><td><button className="admin-button admin-button-small admin-button-primary" onClick={() => setAttachFor({ pool: item })}>Registrar aposta</button></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nada para fazer" description="Nenhum bolão esperando aposta." />}</Panel></>;
  }

  function PartnersView() {
    return <><SectionHeading eyebrow="Dia a dia" title="Lotéricas" description="Lotéricas que fazem as apostas." /><Panel title="Parceiros cadastrados"><Table minWidth={950}><thead><tr><th>Razão social</th><th>CNPJ</th><th>Código Caixa</th><th>Cidade/UF</th><th>Repasse</th><th>Operador</th><th>Bolões</th><th>Status</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td><strong>{item.razaoSocial}</strong></td><td>{item.cnpj}</td><td>{item.codigoCaixa ?? '—'}</td><td>{item.cidade}/{item.uf}</td><td>{item.percentualRepasse}%</td><td>{item.usuarioOperacional?.nome ?? '—'}</td><td>{item._count?.boloes ?? 0}</td><td><span className={statusClass(item.statusContrato)}>{statusLabel(item.statusContrato)}</span></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhuma lotérica parceira" description="Cadastre uma parceira pela API administrativa para acompanhar os vínculos aqui." />}</Panel></>;
  }

  function AuditView() {
    return <><SectionHeading eyebrow="Conta e acesso" title="Histórico" description="O que foi feito no painel, e por quem." /><Panel title="Ações registradas"><Table minWidth={1080}><thead><tr><th>Data</th><th>Evento</th><th>Entidade</th><th>ID</th><th>Ator</th><th>Antes</th><th>Depois</th></tr></thead><tbody>{items.map((item) => <tr key={item.id}><td>{dateTime(item.criadoEm)}</td><td><span className="status-chip">{item.evento}</span></td><td>{item.entidade}</td><td><code>{item.entidadeId?.slice(0, 10)}</code></td><td>{item.ator?.nome ?? 'Sistema'}</td><td><details><summary>Ver</summary><pre>{JSON.stringify(item.payloadAntes ?? null, null, 2)}</pre></details></td><td><details><summary>Ver</summary><pre>{JSON.stringify(item.payloadDepois ?? null, null, 2)}</pre></details></td></tr>)}</tbody></Table>{!items.length && <Empty title="Nenhum evento" description="Ações administrativas e financeiras auditadas aparecerão nesta tabela." />}</Panel></>;
  }

  function SettingsView() {
    const [reserveMinutes, setReserveMinutes] = useState('15');
    const [commission, setCommission] = useState('10');
    return <><SectionHeading eyebrow="Conta e acesso" title="Configurações" description="Ajustes gerais do sistema." /><div className="admin-settings-grid"><Panel title="Reserva e comissão" description="Tempo para pagar e comissão padrão."><div className="admin-form-grid"><label className="admin-field"><span>Prazo de reserva (minutos)</span><input type="number" min="1" max="60" value={reserveMinutes} onChange={(event) => setReserveMinutes(event.target.value)} /></label><label className="admin-field"><span>Comissão padrão (%)</span><input type="number" min="0" max="100" step="0.01" value={commission} onChange={(event) => setCommission(event.target.value)} /></label></div><button className="admin-button admin-button-primary" onClick={() => execute('/api/v1/admin/configuracoes', { method: 'PATCH', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ prazoReservaMinutos: Number(reserveMinutes), comissaoPadraoPct: Number(commission) }) }, 'Configuração salva.')}>Salvar</button></Panel><Panel title="Pagamentos" description="Pix e boleto, processados pela Cora. A confirmação é automática."><div className="admin-callout"><strong>Dados da Cora</strong><p>Senhas e chaves da Cora ficam guardadas no servidor e não aparecem aqui.</p></div></Panel></div></>;
  }

  function renderView() {
    if (view === 'visao-geral') return <DashboardView />;
    if (view === 'relatorios') return <ReportsView />;
    if (view === 'notas-fiscais') return <InvoicesView notify={notify} />;
    if (view === 'concursos') return <ContestsView />;
    if (view === 'boloes') return <PoolsView />;
    if (view === 'jogos') return <GamesView />;
    if (view === 'cotas') return <SharesView />;
    if (view === 'crm') return <CrmView notify={notify} />;
    if (view === 'controle') return <PoolControlView notify={notify} />;
    if (view === 'participantes') return <ParticipantsView />;
    if (view === 'recebimentos' || view === 'pagamentos') return <PaymentsView />;
    if (view === 'afiliados') return <AffiliatesView />;
    if (view === 'rede') return <NetworkView />;
    if (view === 'convites') return <InvitesView />;
    if (view === 'grupos') return <GroupsView />;
    if (view === 'comissoes') return <CommissionsView />;
    if (view === 'repasses') return <RemittancesView />;
    if (view === 'usuarios') return <UsersView />;
    if (view === 'operacao') return <OperationView />;
    if (view === 'comprovantes') return <ReceiptsView />;
    if (view === 'lotericas') return <PartnersView />;
    if (view === 'auditoria') return <AuditView />;
    if (view === 'conexoes') return <ConnectionsView notify={notify} />;
    if (view === 'configuracoes') return <><SettingsView /><PaymentSettingsPanel notify={notify} /></>;
    return <DashboardView />;
  }

  return <AdminShell testMode={testMode}>{selectedUser && <AdminUserEditor key={selectedUser} id={selectedUser} onClose={() => setSelectedUser(null)} onDone={load} />}<p className="admin-help" role="status">{updatedAt ? `Dados consultados às ${updatedAt.toLocaleTimeString('pt-BR')}.` : 'Consultando dados…'} Atualização a cada 15 s; pausada durante edição. <Link href="/admin?view=relatorios">Exportar relatórios</Link></p>{viewsWithTables.has(view) && <div className="admin-toolbar"><div className="admin-toolbar-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void load(); }} placeholder="Buscar neste módulo…" aria-label="Buscar" /></div><div className="admin-toolbar-filters">{view !== 'concursos' && <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar por status"><option value="">{view === 'usuarios' ? 'Contas ativas' : 'Todos os status'}</option>{view === 'usuarios' && <><option value="inativo">Acesso removido</option><option value="todos">Todas as contas</option></>}{view !== 'usuarios' && <><option value="aberto">Aberto</option><option value="fechado">Fechado</option><option value="pendente">Pendente</option><option value="paga">Paga</option><option value="confirmado">Confirmado</option><option value="aprovado">Aprovado</option></>}</select>}<button className="admin-button admin-button-ghost" onClick={() => void load()}>Atualizar</button></div></div>}{toast && <div className={`admin-toast ${toast.type === 'error' ? 'admin-toast-error' : ''}`}>{toast.text}</div>}{attachFor && (attachFor.share ? <AdminModal title={`Recibo · ${attachFor.share.titularNome}`} onClose={() => setAttachFor(null)}><p className="admin-help">O recibo individual aparece na conta do cliente e ele é avisado.</p><AttachmentsPanel poolId={attachFor.pool.id} shares={[attachFor.share]} forceShareId={attachFor.share.id} notify={notify} /></AdminModal> : <RegisterBetDialog pool={attachFor.pool} onClose={() => setAttachFor(null)} onDone={() => void load()} notify={notify} />)}{loading ? <div className="admin-loading"><span className="admin-spinner" /><p>Carregando…</p></div> : renderView()}{view !== 'concursos' && viewsWithTables.has(view) && (payload.pagination?.pages ?? 0) > 1 && <nav className="admin-toolbar" aria-label="Paginação"><button className="admin-button" disabled={loading || page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {page} de {payload.pagination?.pages} · {payload.pagination?.total} registros</span><button className="admin-button" disabled={loading || page >= (payload.pagination?.pages ?? 1)} onClick={() => setPage(p => p + 1)}>Próxima</button></nav>}</AdminShell>;
}

function PoolWizard({ contests, groupId, onSuccess }: { contests: RecordValue[]; groupId: string | null; onSuccess: () => Promise<void> | void }) {
  const [step, setStep] = useState(1);
  const [modality, setModality] = useState('megasena');
  const [contestId, setContestId] = useState('');
  const [games, setGames] = useState<GameDraft[]>([{ ordem: 1, numeros: [], custo: '0' }]);
  const [totalCotas, setTotalCotas] = useState('10');
  const [valorCota, setValorCota] = useState('20');
  const [taxa, setTaxa] = useState('10');
  const [description, setDescription] = useState('');
  const [message, setMessage] = useState('');
  const [saving, setSaving] = useState(false);
  const limits = modalityLimits[modality] ?? modalityLimits.megasena!;
  const availableContests = contests.filter((contest) => contest.modalidade === modality && ['aberto', 'aberta'].includes(String(contest.status).toLowerCase()));
  const selectedContest = contests.find((contest) => contest.id === contestId);
  const totalGameCost = games.reduce((sum, game) => sum + Number(game.custo || 0), 0);
  const predictedRevenue = Number(totalCotas || 0) * Number(valorCota || 0);
  const predictedFee = predictedRevenue * Number(taxa || 0) / 100;

  useEffect(() => { if (!contestId && availableContests[0]) setContestId(availableContests[0].id); }, [availableContests, contestId]);

  function updateGame(index: number, data: Partial<GameDraft>) { setGames((current) => current.map((game, gameIndex) => gameIndex === index ? { ...game, ...data } : game)); }
  function toggleNumber(index: number, number: number) { const game = games[index]!; const numbers = game.numeros.includes(number) ? game.numeros.filter((value) => value !== number) : [...game.numeros, number].sort((a, b) => a - b); updateGame(index, { numeros: numbers }); }
  function addGame() { setGames((current) => [...current, { ordem: current.length + 1, numeros: [], custo: '0' }]); }
  function removeGame(index: number) { if (games.length === 1) return; setGames((current) => current.filter((_, gameIndex) => gameIndex !== index).map((game, gameIndex) => ({ ...game, ordem: gameIndex + 1 }))); }
  function validateStep() {
    setMessage('');
    if (step === 1 && !modality) return setMessage('Selecione uma modalidade.');
    if (step === 2 && !contestId) return setMessage('Selecione um concurso aberto.');
    if (step === 3 && games.some((game) => game.numeros.length < limits.min)) return setMessage(`Cada jogo precisa de pelo menos ${limits.min} números.`);
    if (step === 4 && (Number(totalCotas) < 1 || Number(valorCota) <= 0 || Number(taxa) < 0)) return setMessage('Revise cotas, valor e taxa administrativa.');
    setStep((current) => Math.min(5, current + 1));
  }
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!groupId || !selectedContest) { setMessage('Grupo oficial ou concurso não encontrado.'); return; }
    setSaving(true);
    try {
      const response = await authFetch('/api/v1/admin/boloes', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ concursoId: contestId, grupoId: groupId, numerosApostados: games[0]?.numeros ?? [], jogos: games.map((game) => ({ ordem: game.ordem, numeros: game.numeros, quantidadeDezenas: game.numeros.length, custo: Number(game.custo || 0) })), totalCotas: Number(totalCotas), valorCota: Number(valorCota), taxaAdministracaoPct: Number(taxa), modeloOperacional: 'mandato', descricao: description || undefined }) });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(Array.isArray(payload.message) ? payload.message.join(' ') : payload.message || 'Não foi possível criar o bolão.');
      setMessage('Bolão criado com sucesso.');
      await onSuccess();
      setStep(1); setGames([{ ordem: 1, numeros: [], custo: '0' }]); setDescription('');
    } catch (error) { setMessage(error instanceof Error ? error.message : 'Falha ao criar bolão.'); }
    finally { setSaving(false); }
  }

  return <form className="pool-wizard" onSubmit={submit}><div className="wizard-steps">{['Modalidade', 'Concurso', 'Jogos', 'Cotas', 'Revisão'].map((label, index) => <div key={label} className={`wizard-step ${step === index + 1 ? 'is-current' : ''} ${step > index + 1 ? 'is-done' : ''}`}><span>{index + 1}</span>{label}</div>)}</div>{message && <div className="admin-callout admin-callout-warning">{message}</div>}{step === 1 && <div className="wizard-content"><div className="wizard-intro"><span className="admin-eyebrow">Etapa 1</span><h3>Escolha a modalidade</h3><p>A modalidade define a faixa de números e o concurso disponível.</p></div><div className="modality-picker">{Object.entries(modalityNames).map(([key, label]) => <button type="button" key={key} className={modality === key ? 'is-selected' : ''} onClick={() => { setModality(key); setContestId(''); }}><strong>{label}</strong><small>{modalityLimits[key]?.min} números mínimos</small></button>)}</div></div>}{step === 2 && <div className="wizard-content"><div className="wizard-intro"><span className="admin-eyebrow">Etapa 2</span><h3>Selecione o concurso</h3><p>Só dá para criar bolão em concursos abertos e dentro do prazo.</p></div><div className="contest-picker">{availableContests.length ? availableContests.map((contest) => <button type="button" key={contest.id} className={contestId === contest.id ? 'is-selected' : ''} onClick={() => setContestId(contest.id)}><span>{modalityNames[contest.modalidade]}</span><strong>Concurso {contest.numeroConcurso}</strong><small>{dateOnly(contest.dataSorteio)} · Prêmio {money(contest.valorEstimadoPremio)}</small></button>) : <Empty title="Nenhum concurso aberto" description="Sincronize os concursos e tente novamente." />}</div></div>}{step === 3 && <div className="wizard-content"><div className="wizard-intro"><span className="admin-eyebrow">Etapa 3</span><h3>Monte os jogos</h3><p>Adicione quantos jogos forem necessários. Os números serão validados no backend.</p></div><div className="games-builder">{games.map((game, index) => <div className="game-builder-card" key={game.ordem}><div className="game-builder-heading"><strong>Jogo {String(game.ordem).padStart(3, '0')}</strong><button type="button" className="admin-text-button" onClick={() => removeGame(index)} disabled={games.length === 1}>Remover</button></div><div className="number-grid">{Array.from({ length: limits.max }, (_, value) => value + 1).map((number) => <button type="button" key={number} className={game.numeros.includes(number) ? 'is-selected' : ''} onClick={() => toggleNumber(index, number)}>{String(number).padStart(2, '0')}</button>)}</div><div className="game-builder-footer"><span>{game.numeros.length}/{limits.pick} selecionados</span><label>Custo do jogo <input type="number" min="0" step="0.01" value={game.custo} onChange={(event) => updateGame(index, { custo: event.target.value })} /></label></div></div>)}<button type="button" className="admin-button admin-button-ghost" onClick={addGame}>+ Adicionar jogo</button></div></div>}{step === 4 && <div className="wizard-content"><div className="wizard-intro"><span className="admin-eyebrow">Etapa 4</span><h3>Configure as cotas</h3><p>Defina a capacidade, o valor da cota e a taxa dentro do limite da modalidade.</p></div><div className="admin-form-grid admin-form-grid-three"><label className="admin-field"><span>Total de cotas</span><input type="number" min="1" value={totalCotas} onChange={(event) => setTotalCotas(event.target.value)} /></label><label className="admin-field"><span>Valor da cota (R$)</span><input type="number" min="0.01" step="0.01" value={valorCota} onChange={(event) => setValorCota(event.target.value)} /></label><label className="admin-field"><span>Taxa administrativa (%)</span><input type="number" min="0" max="35" step="0.01" value={taxa} onChange={(event) => setTaxa(event.target.value)} /></label></div><label className="admin-field"><span>Descrição pública</span><textarea value={description} onChange={(event) => setDescription(event.target.value)} placeholder="Conte como o bolão funciona." /></label></div>}{step === 5 && <div className="wizard-content"><div className="wizard-intro"><span className="admin-eyebrow">Conferir</span><h3>Confira antes de publicar</h3><p>O backend recalcula os valores e aplica as validações do concurso.</p></div><div className="wizard-review"><div><span>Modalidade</span><strong>{modalityNames[modality]}</strong></div><div><span>Concurso</span><strong>#{selectedContest?.numeroConcurso ?? '—'}</strong></div><div><span>Jogos</span><strong>{games.length}</strong></div><div><span>Cotas</span><strong>{totalCotas} × {money(valorCota)}</strong></div><div><span>Receita prevista</span><strong>{money(predictedRevenue)}</strong></div><div><span>Taxa prevista</span><strong>{money(predictedFee)}</strong></div><div><span>Gasto nas apostas</span><strong>{money(totalGameCost)}</strong></div><div><span>Sua sobra</span><strong>{money(predictedFee - totalGameCost)}</strong></div></div></div>}<div className="wizard-actions">{step > 1 && <button type="button" className="admin-button admin-button-ghost" onClick={() => setStep((current) => current - 1)}>Voltar</button>}{step < 5 ? <button type="button" className="admin-button admin-button-primary" onClick={validateStep}>Continuar</button> : <button className="admin-button admin-button-primary" disabled={saving}>{saving ? 'Criando…' : 'Criar bolão'}</button>}</div></form>;
}

export function AdminDashboard({ testMode = false }: { testMode?: boolean }) {
  return <AdminDashboardContent testMode={testMode} />;
}
