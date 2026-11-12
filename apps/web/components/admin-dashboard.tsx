'use client';

import { FormEvent, useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { AdminUserEditor } from './admin-user-editor';
import { AdminShell } from './admin-shell';
import { StaffGate, useIsSuperAdmin } from './staff-gate';
import { PoolWizard as SimplePoolWizard } from './pool-wizard';
import { CrmView, PoolControlView } from './admin-crm-tools';
import { ComunicadosView } from './admin-comunicados';
import { DocumentsView } from './admin-documents';
import { FunnelView } from './admin-funnel';
import { VitrineView } from './admin-vitrine';
import { BlogAdminView } from './admin-blog';
import { AdminModal, AttachmentsPanel, RegisterBetDialog } from './admin-attachments';
import { ConnectionsView } from './admin-connections';
import { InvoicesView, ReportsView } from './admin-finance-tools';
import { CaixaIntegrationView, NfseIntegrationView, PaymentsIntegrationView } from './admin-integrations';
import { modalityNames } from '../lib/domain';
import { fetchAdmin, poolForAttachments } from './admin-views/shared';
import type { AdminCtx, DashboardPayload, PagePayload, RecordValue, ToastState } from './admin-views/shared';
import { DashboardView } from './admin-views/dashboard-view';
import { ContestsView } from './admin-views/contests-view';
import { PoolsView } from './admin-views/pools-view';
import { SharesView } from './admin-views/shares-view';
import { PaymentsView } from './admin-views/payments-view';
import { GamesView } from './admin-views/games-view';
import { ReceiptsView } from './admin-views/receipts-view';
import { AffiliatesView } from './admin-views/affiliates-view';
import { InvitesView } from './admin-views/invites-view';
import { GroupsView } from './admin-views/groups-view';
import { CommissionsView } from './admin-views/commissions-view';
import { RemittancesView } from './admin-views/remittances-view';
import { UsersView } from './admin-views/users-view';
import { OperationView } from './admin-views/operation-view';
import { PartnersView } from './admin-views/partners-view';
import { AuditView } from './admin-views/audit-view';
import { SettingsView } from './admin-views/settings-view';
import { FinanceView } from './admin-views/finance-view';
import { AdminHubTabs } from './admin-hub-tabs';
import { WalletAdminView } from './admin-wallet';
import { PromotionsAdminView } from './admin-promotions';

// Telas que buscam os próprios dados (ou não precisam de lista): o painel não faz a busca genérica para elas.
const selfLoadingViews = new Set(['relatorios', 'financeiro', 'notas-fiscais', 'carteira', 'cupons', 'conexoes', 'integ-nfse', 'integ-pagamentos', 'integ-caixa', 'crm', 'controle', 'comunicados', 'configuracoes', 'vitrine', 'blog', 'documentos', 'funil']);
const viewsWithTables = new Set(['concursos', 'boloes', 'jogos', 'cotas', 'recebimentos', 'pagamentos', 'afiliados', 'comissoes', 'repasses', 'usuarios', 'operacao', 'comprovantes', 'lotericas', 'auditoria', 'grupos', 'convites']);

const MONTH_LABELS = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
/** Meses (AAAA-MM) de `from` até `to` em relação ao mês atual (Brasília), do mais novo para o mais antigo quando for histórico. */
function filterMonths(from: number, to: number) {
  const base = new Date(Date.now() - 3 * 3600_000);
  const list = [];
  for (let offset = from; offset <= to; offset += 1) {
    const date = new Date(Date.UTC(base.getUTCFullYear(), base.getUTCMonth() + offset, 1));
    list.push({ key: date.toISOString().slice(0, 7), label: `${MONTH_LABELS[date.getUTCMonth()]} ${date.getUTCFullYear()}` });
  }
  return to <= 0 ? list.reverse() : list;
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
  const superAdmin = useIsSuperAdmin();
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<ToastState>(null);
  const [period, setPeriod] = useState('30d');
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [contestScope, setContestScope] = useState<'aberto' | 'festas' | 'historico'>('aberto');
  const [contestMonth, setContestMonth] = useState<string>(() => new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 7));
  const [modalityFilter, setModalityFilter] = useState('');
  const [monthFilter, setMonthFilter] = useState('');
  const [page, setPage] = useState(1);
  const [selectedCommissions, setSelectedCommissions] = useState<string[]>([]);
  const [selectedUser, setSelectedUser] = useState<string | null>(null);
  const [crmRefresh, setCrmRefresh] = useState(0);
  const [roleTab, setRoleTab] = useState<'equipe' | 'afiliado' | 'cotista' | 'todos'>('equipe');
  const [editingPool, setEditingPool] = useState<RecordValue | null>(null);
  const [groupMembers, setGroupMembers] = useState<{ id: string; nome: string; total: number; membros: RecordValue[] } | null>(null);
  const [attachFor, setAttachFor] = useState<{ pool: RecordValue; share?: RecordValue } | null>(null);

  const [showPoolForm, setShowPoolForm] = useState(false);
  const [poolFor, setPoolFor] = useState<RecordValue | null>(null);
  const [gamesTab, setGamesTab] = useState<'bolaos' | 'banco'>('bolaos');
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
        if (view === 'concursos') {
          query.set('status', contestScope);
          if (contestScope === 'aberto') query.set('pageSize', '100');
          if (monthFilter) query.set('mes', monthFilter);
          if (modalityFilter) query.set('modalidade', modalityFilter);
        } else if (statusFilter) query.set('status', statusFilter);
        if (view === 'boloes') { if (modalityFilter) query.set('modalidade', modalityFilter); if (monthFilter) query.set('mes', monthFilter); }
        if (view === 'usuarios' && roleTab !== 'todos') query.set('papel', roleTab);
      }
      const endpointView = view === 'pagamentos' ? 'recebimentos' : view === 'jogos' ? 'boloes' : view === 'comprovantes' ? 'operacao' : view;
      const endpoint = view === 'visao-geral' ? `/api/v1/admin/dashboard?${query.toString()}` : `/api/v1/admin/${endpointView}?${query.toString()}`;
      const result = await fetchAdmin(endpoint);
      if (sequence !== requestSequence.current) return;
      setUpdatedAt(new Date());
      if (view === 'visao-geral') setDashboard(result);
      else setPayload(result);
      if (view === 'concursos') {
        setContests(result.items ?? []);
        if (!groupId) { const group = await fetch('/api/v1/grupos/bl-oficial').then((response) => response.ok ? response.json() : null).catch(() => null); setGroupId(group?.id ?? null); }
      }
      if (view === 'visao-geral' || view === 'boloes') {
        // O assistente de bolão recebe os concursos da CAIXA e os de festa; os de festa só aparecem no seletor quando você os escolhe ou cria.
        const [contestPayload, festaPayload, group] = await Promise.all([fetchAdmin('/api/v1/admin/concursos?page=1&pageSize=100&status=aberto'), fetchAdmin('/api/v1/admin/concursos?page=1&pageSize=100&status=festas'), fetch('/api/v1/grupos/bl-oficial').then((response) => response.ok ? response.json() : null)]);
        setContests([...(contestPayload.items ?? []), ...(festaPayload.items ?? [])]);
        setGroupId(group?.id ?? null);
      }
      if (['afiliados', 'convites', 'grupos'].includes(view)) {
        const affiliatePayload = await fetchAdmin('/api/v1/admin/afiliados?page=1&pageSize=100');
        setAffiliateOptions(affiliatePayload.items ?? []);
      }
    } catch (error) {
      setToast({ type: 'error', text: error instanceof Error ? error.message : 'Falha ao carregar o painel.' });
    } finally {
      if (sequence === requestSequence.current) setLoading(false);
    }
  }, [contestScope, modalityFilter, monthFilter, page, period, roleTab, search, statusFilter, view]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { setPage(1); }, [view, contestScope, statusFilter, search, roleTab, modalityFilter, monthFilter]);
  // Filtros de modalidade e mês valem só dentro da tela em que foram escolhidos.
  // Em Concursos (em aberto) o mês atual já vem escolhido; nas outras listas começa em "Todos os meses".
  // Sempre abre em "Todos os meses": o mês é só um filtro opcional, para nada ficar escondido.
  useEffect(() => { setModalityFilter(''); setMonthFilter(''); }, [view]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { setMonthFilter(''); }, [contestScope]);
  useEffect(() => { void load(); return () => { requestSequence.current++; }; }, [load]);
  useEffect(() => {
    const refresh = () => { if (['visao-geral', 'boloes', 'cotas', 'pagamentos', 'recebimentos'].includes(view) && !busy && !editingPool && !attachFor && !showPoolForm && document.visibilityState === 'visible') void load(true); };
    const timer = window.setInterval(refresh, 15000);
    window.addEventListener('focus', refresh);
    return () => { clearInterval(timer); window.removeEventListener('focus', refresh); };
  }, [load, busy, editingPool, attachFor, showPoolForm, view]);
  useEffect(() => { if (!toast) return; const timeout = window.setTimeout(() => setToast(null), 5000); return () => window.clearTimeout(timeout); }, [toast]);

  // A fila de operação (Para fazer / Comprovantes) devolve uma lista direta; as demais telas devolvem { items }.
  const items: RecordValue[] = Array.isArray(payload) ? (payload as RecordValue[]) : payload.items ?? [];
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

  const ctx: AdminCtx = {
    view, items, payload, kpis, chart, chartMax, dashboard, period, setPeriod, busy, superAdmin,
    contestScope, setContestScope, contestMonth, setContestMonth, page, setPage, showPoolForm, setShowPoolForm, editingPool, setEditingPool,
    contests, groupId, affiliateOptions, selectedCommissions, setSelectedCommissions, roleTab, setRoleTab,
    groupMembers, setGroupMembers, gamesTab, setGamesTab, setPoolFor, setAttachFor, setSelectedUser, setToast,
    load, execute, notify, syncContests, importHistory,
  };

  function renderView() {
    if (view === 'visao-geral') return <DashboardView ctx={ctx} />;
    if (view === 'relatorios') return <ReportsView />;
    if (view === 'financeiro') return <FinanceView />;
    if (view === 'notas-fiscais') return <InvoicesView notify={notify} />;
    if (view === 'carteira') return <WalletAdminView notify={notify} />;
    if (view === 'cupons') return <PromotionsAdminView notify={notify} />;
    if (view === 'concursos') return <ContestsView ctx={ctx} />;
    if (view === 'boloes') return <PoolsView ctx={ctx} />;
    if (view === 'jogos') return <GamesView ctx={ctx} />;
    if (view === 'cotas') return <SharesView ctx={ctx} />;
    if (view === 'crm') return <CrmView notify={notify} onEditUser={setSelectedUser} refreshKey={crmRefresh} />;
    if (view === 'comunicados') return <ComunicadosView notify={notify} />;
    if (view === 'vitrine') return <VitrineView notify={notify} />;
    if (view === 'blog') return <BlogAdminView notify={notify} />;
    if (view === 'controle') return <PoolControlView notify={notify} />;
    if (view === 'recebimentos' || view === 'pagamentos') return <PaymentsView ctx={ctx} />;
    if (view === 'afiliados') return <AffiliatesView ctx={ctx} />;
    if (view === 'convites') return <InvitesView ctx={ctx} />;
    if (view === 'grupos') return <GroupsView ctx={ctx} />;
    if (view === 'comissoes') return <CommissionsView ctx={ctx} />;
    if (view === 'repasses') return <RemittancesView ctx={ctx} />;
    if (view === 'usuarios') return <UsersView ctx={ctx} />;
    if (view === 'operacao') return <OperationView ctx={ctx} />;
    if (view === 'comprovantes') return <ReceiptsView ctx={ctx} />;
    if (view === 'lotericas') return <PartnersView ctx={ctx} />;
    if (view === 'auditoria') return <AuditView ctx={ctx} />;
    if (view === 'documentos') return <DocumentsView notify={notify} />;
    if (view === 'funil') return <FunnelView notify={notify} />;
    if (view === 'conexoes') return <ConnectionsView notify={notify} />;
    if (view === 'integ-nfse') return <NfseIntegrationView notify={notify} />;
    if (view === 'integ-pagamentos') return <PaymentsIntegrationView notify={notify} />;
    if (view === 'integ-caixa') return <CaixaIntegrationView />;
    if (view === 'configuracoes') return <SettingsView ctx={ctx} />;
    return <DashboardView ctx={ctx} />;
  }

  return <AdminShell testMode={testMode}>{selectedUser && <AdminUserEditor key={selectedUser} id={selectedUser} onClose={() => setSelectedUser(null)} onDone={async () => { setCrmRefresh((value) => value + 1); await load(); }} />}{viewsWithTables.has(view) && <div className="admin-toolbar"><div className="admin-toolbar-search"><span aria-hidden="true">⌕</span><input value={search} onChange={(event) => setSearch(event.target.value)} onKeyDown={(event) => { if (event.key === 'Enter') void load(); }} placeholder="Buscar neste módulo…" aria-label="Buscar" /></div><div className="admin-toolbar-filters">{(view === 'concursos' || view === 'boloes') && <select value={modalityFilter} onChange={(event) => setModalityFilter(event.target.value)} aria-label="Filtrar por modalidade"><option value="">Todas as modalidades</option>{Object.entries(modalityNames).map(([key, name]) => <option key={key} value={key}>{name}</option>)}</select>}{(view === 'boloes' || view === 'concursos') && <select value={monthFilter} onChange={(event) => setMonthFilter(event.target.value)} aria-label="Filtrar por mês do sorteio"><option value="">Todos os meses</option>{filterMonths(view === 'concursos' && contestScope === 'historico' ? -12 : view === 'concursos' ? 0 : -3, view === 'concursos' && contestScope === 'historico' ? 0 : 12).map((month) => <option key={month.key} value={month.key}>{month.label}</option>)}</select>}{view !== 'concursos' && <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value)} aria-label="Filtrar por status"><option value="">{view === 'usuarios' ? 'Contas ativas' : 'Todos os status'}</option>{view === 'usuarios' && <><option value="inativo">Acesso removido</option><option value="todos">Todas as contas</option></>}{view !== 'usuarios' && <><option value="aberto">Aberto</option><option value="fechado">Fechado</option><option value="pendente">Pendente</option><option value="paga">Paga</option><option value="confirmado">Confirmado</option><option value="aprovado">Aprovado</option></>}</select>}<button className="admin-button admin-button-ghost" onClick={() => void load()}>Atualizar</button></div></div>}{toast && <div className={`admin-toast ${toast.type === 'error' ? 'admin-toast-error' : ''}`}>{toast.text}</div>}{poolFor && <AdminModal title={`Novo bolão · ${modalityNames[poolFor.modalidade] ?? poolFor.modalidade}${poolFor.nomeEspecial ? ` · ${poolFor.nomeEspecial}` : ''}`} onClose={() => setPoolFor(null)}><SimplePoolWizard contests={contests} groupId={groupId} initialContestId={poolFor.id} onContestCreated={async () => { await load(true); }} onSuccess={async (created) => { setPoolFor(null); await load(); if (created?.id) setAttachFor({ pool: poolForAttachments(created) }); }} /></AdminModal>}{attachFor && (attachFor.share ? <AdminModal title={`Recibo · ${attachFor.share.titularNome}`} onClose={() => setAttachFor(null)}><AttachmentsPanel poolId={attachFor.pool.id} shares={[attachFor.share]} forceShareId={attachFor.share.id} notify={notify} /></AdminModal> : <RegisterBetDialog pool={attachFor.pool} onClose={() => setAttachFor(null)} onDone={() => void load()} notify={notify} />)}<AdminHubTabs view={view} />{loading ? <div className="admin-loading"><span className="admin-spinner" /><p>Carregando…</p></div> : renderView()}{view !== 'concursos' && viewsWithTables.has(view) && (payload.pagination?.pages ?? 0) > 1 && <nav className="admin-toolbar" aria-label="Paginação"><button className="admin-button" disabled={loading || page <= 1} onClick={() => setPage(p => p - 1)}>Anterior</button><span>Página {page} de {payload.pagination?.pages} · {payload.pagination?.total} registros</span><button className="admin-button" disabled={loading || page >= (payload.pagination?.pages ?? 1)} onClick={() => setPage(p => p + 1)}>Próxima</button></nav>}</AdminShell>;
}

export function AdminDashboard({ testMode = false }: { testMode?: boolean }) {
  return <StaffGate><AdminDashboardContent testMode={testMode} /></StaffGate>;
}
